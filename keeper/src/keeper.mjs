// Hamstr keeper: harvests each vault when the yield is clearly worth more than the gas.
//
// Per vault:
//   1. skip if paused (the guardian is dealing with something) or below the vault's minHarvest
//   2. value the pending yield in USD and in cbBTC via the swapper's Chainlink quote
//   3. simulate harvest() – catches stale prices, deficits etc. without spending gas
//   4. estimate the total fee (L2 execution + L1 data) and require yield >= MIN_PROFIT_MULTIPLE x fee
//   5. send harvest() with our own minimum output on top of the swapper's oracle floor
//
// Environment:
//   RPC_URL              required
//   KEEPER_PRIVATE_KEY   required unless DRY_RUN=1 (the key only holds KEEPER_ROLE: it can harvest, nothing else)
//   DEPLOYMENT           path to a deployments/<chainId>.json (default: contracts/deployments/8453.json)
//   MIN_PROFIT_MULTIPLE  yield must be worth this many times the fee (default 5)
//   SLIPPAGE_BPS         our minimum output below the oracle value (default 75 = 0.75%)
//   DRY_RUN=1            check and log only, never send
//
// Exit code 0 when every vault was harvested or skipped for a normal reason ("nothing to harvest",
// "not worth it yet"); 1 on real problems (stale oracle, deficit, missing role, low keeper balance).
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  formatEther,
  formatUnits,
  http,
  parseAbi,
  parseEther,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { publicActionsL2 } from "viem/op-stack";

const vaultAbi = parseAbi([
  "function asset() view returns (address)",
  "function paused() view returns (bool)",
  "function pendingYield() view returns (uint256)",
  "function unrealizedYield() view returns (uint256)",
  "function minHarvest() view returns (uint256)",
  "function harvest(uint256 minRewardsOut) returns (uint256)",
  "event Harvest(uint256 indexed epoch, uint256 yieldSwapped, uint256 rewardsOut, uint256 fee, uint256 userRewards)",
  "error NothingToHarvest()",
  "error Deficit()",
  "error AccessControlUnauthorizedAccount(address account, bytes32 neededRole)",
]);

const swapperAbi = parseAbi([
  "function quote(address tokenIn, address tokenOut, uint256 amountIn) view returns (uint256)",
  "error StalePrice(address token)",
  "error InvalidPrice(address token)",
  "error SequencerDown()",
  "error NoFeed(address token)",
]);

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOW_BALANCE = parseEther("0.002");

const env = {
  rpcUrl: process.env.RPC_URL,
  privateKey: process.env.KEEPER_PRIVATE_KEY,
  deployment: resolve(repoRoot, process.env.DEPLOYMENT ?? "contracts/deployments/8453.json"),
  minProfitMultiple: Number(process.env.MIN_PROFIT_MULTIPLE ?? 5),
  slippageBps: BigInt(process.env.SLIPPAGE_BPS ?? 75),
  dryRun: process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true",
};

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

/** Short reason for a failed call, using the custom error name where there is one. */
function reason(err) {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert?.data?.errorName) return `${revert.data.errorName}(${(revert.data.args ?? []).join(", ")})`;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

async function main() {
  if (!existsSync(env.deployment)) {
    log(`No deployment at ${env.deployment} – nothing to do (contracts not deployed on this network yet).`);
    return true;
  }
  if (!env.rpcUrl) throw new Error("RPC_URL is not set");
  if (!env.privateKey && !env.dryRun) throw new Error("KEEPER_PRIVATE_KEY is not set (or use DRY_RUN=1)");

  const d = JSON.parse(readFileSync(env.deployment, "utf8"));
  // The local anvil fork (31337) is a copy of Base, so Base's chain config (fee oracle etc.) applies.
  const chain = d.chainId === base.id ? base : { ...base, id: d.chainId, name: `Base fork (${d.chainId})` };
  const transport = http(env.rpcUrl);
  const client = createPublicClient({ chain, transport }).extend(publicActionsL2());

  const rpcChainId = await client.getChainId();
  if (rpcChainId !== d.chainId) throw new Error(`RPC is chain ${rpcChainId}, deployment is for ${d.chainId}`);

  const account = env.privateKey ? privateKeyToAccount(env.privateKey) : d.keeper;
  const keeperAddress = typeof account === "string" ? account : account.address;
  const wallet = env.privateKey ? createWalletClient({ chain, transport, account }) : null;

  const balance = await client.getBalance({ address: keeperAddress });
  log(`Keeper ${keeperAddress} on chain ${d.chainId}, balance ${formatEther(balance)} ETH${env.dryRun ? " (dry run)" : ""}`);
  // Still harvest, but fail the run so the scheduler alerts before the wallet runs dry.
  const lowBalance = balance < LOW_BALANCE;
  if (lowBalance) log(`WARNING: keeper balance below ${formatEther(LOW_BALANCE)} ETH – top it up.`);

  const quote = (tokenIn, tokenOut, amount) =>
    client.readContract({ address: d.swapper, abi: swapperAbi, functionName: "quote", args: [tokenIn, tokenOut, amount] });

  let ok = true;
  for (const [name, vault] of [
    ["USDC vault", d.usdcVault],
    ["ETH vault", d.ethVault],
  ]) {
    try {
      const result = await harvestVault({ name, vault, d, client, wallet, account, quote });
      log(`${name}: ${result}`);
    } catch (err) {
      ok = false;
      log(`${name}: ERROR ${reason(err)}`);
    }
  }
  return ok && !lowBalance;
}

async function harvestVault({ name, vault, d, client, wallet, account, quote }) {
  const read = (functionName) => client.readContract({ address: vault, abi: vaultAbi, functionName });
  const [asset, paused, pendingYield, unrealized, minHarvest] = await Promise.all([
    read("asset"),
    read("paused"),
    read("pendingYield"),
    read("unrealizedYield"),
    read("minHarvest"),
  ]);
  if (paused) return "skipped – vault is paused";

  const decimals = asset.toLowerCase() === d.usdc.toLowerCase() ? 6 : 18;
  const yieldAmount = pendingYield + unrealized;
  if (yieldAmount === 0n) return "skipped – nothing to harvest";
  if (yieldAmount < minHarvest) {
    return `skipped – yield ${formatUnits(yieldAmount, decimals)} below minimum ${formatUnits(minHarvest, decimals)}`;
  }

  // From here on, failures are real problems (stale oracle, deficit, missing role, ...): they throw,
  // so the run exits with 1 and the scheduler reports it.
  const sats = await quote(asset, d.cbbtc, yieldAmount);
  const yieldUsd = asset.toLowerCase() === d.usdc.toLowerCase() ? yieldAmount : await quote(asset, d.usdc, yieldAmount);
  const minOut = (sats * (10_000n - env.slippageBps)) / 10_000n;
  const request = { address: vault, abi: vaultAbi, functionName: "harvest", args: [minOut], account };

  try {
    await client.simulateContract(request);
  } catch (err) {
    throw new Error(`harvest would fail: ${reason(err)}`);
  }

  const gas = await client.estimateContractGas(request);
  let feeWei;
  try {
    feeWei = await client.estimateTotalFee({
      account,
      to: vault,
      data: encodeFunctionData({ abi: vaultAbi, functionName: "harvest", args: [minOut] }),
    });
  } catch {
    feeWei = (gas * (await client.getGasPrice()) * 12n) / 10n; // fallback without the L1 data fee estimate
  }
  const feeUsd = await quote(d.weth, d.usdc, feeWei);

  const summary =
    `yield ${formatUnits(yieldAmount, decimals)} ($${formatUnits(yieldUsd, 6)}) ≈ ${sats} sats, ` +
    `fee ≈ $${formatUnits(feeUsd, 6)} (${gas} gas)`;
  if (Number(yieldUsd) < Number(feeUsd) * env.minProfitMultiple) {
    return `skipped – not worth it yet (${summary}, need ${env.minProfitMultiple}x)`;
  }
  if (!wallet) return `would harvest (${summary}, minOut ${minOut} sats)`;

  const hash = await wallet.writeContract({ ...request, gas: (gas * 12n) / 10n });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`harvest reverted in tx ${hash}`);
  const [event] = parseEventLogs({ abi: vaultAbi, eventName: "Harvest", logs: receipt.logs });
  const out = event
    ? `${event.args.rewardsOut} sats (users ${event.args.userRewards}, fee ${event.args.fee})`
    : "see tx";
  return `harvested ${out} – ${summary} – tx ${hash}`;
}

main()
  .then((ok) => process.exit(ok ? 0 : 1))
  .catch((err) => {
    log(`FATAL ${reason(err)}`);
    process.exit(1);
  });
