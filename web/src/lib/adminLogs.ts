import { createPublicClient, decodeEventLog, http, keccak256, parseAbi, toHex, type Address, type Hex } from "viem";
import { base } from "viem/chains";
import { btcYieldVaultAbi, turboVaultAbi } from "@/generated/contracts";
import type { Live } from "./live";
import { activeChain, NETWORK } from "./network";

/**
 * Event history for the admin dashboard, read straight from the chain (no backend).
 * mainnet.base.org rate-limits eth_getLogs, publicnode serves 50k-block ranges with CORS.
 */
const LOG_RPC = NETWORK === "fork" ? activeChain.rpcUrls.default.http[0] : "https://base-rpc.publicnode.com";
const CHUNK = 49_999n;
/** Base produces a block every 2 seconds, so block numbers map to time without extra requests. */
const BLOCK_SECONDS = 2;
const CACHE_KEY = "hamstr-admin-logs-v1";

const client = createPublicClient({ chain: NETWORK === "fork" ? activeChain : base, transport: http(LOG_RPC) });

const timelockAbi = parseAbi([
  "event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)",
  "event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)",
  "event Cancelled(bytes32 indexed id)",
  "event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)",
  "event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)",
]);

type RawLog = { address: Address; topics: Hex[]; data: Hex; block: string };
type Cache = { from: string; to: string; logs: RawLog[] };

function readCache(from: bigint): Cache | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Cache | null;
    return c && c.from === from.toString() ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: Cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    // Storage full or blocked: the next visit simply loads everything again.
  }
}

export type AdminLogs = { logs: RawLog[]; latestBlock: bigint; latestTime: number };

/** All logs of the vaults and the timelock since deployment; only new blocks are fetched on later visits. */
export async function fetchAdminLogs(live: Live): Promise<AdminLogs> {
  const d = live.deployment as Live["deployment"] & { block?: number };
  const addresses = [d.usdcVault, d.ethVault, d.timelock, ...(d.turboVault ? [d.turboVault] : [])];
  // The deploy script's block is recorded after the contracts went out; start a little earlier.
  const from = BigInt(Math.max(0, (d.block ?? 0) - 5_000));
  const latest = await client.getBlock();
  const cached = readCache(from);
  const logs = cached ? [...cached.logs] : [];
  let start = cached ? BigInt(cached.to) + 1n : from;

  while (start <= latest.number) {
    const end = start + CHUNK > latest.number ? latest.number : start + CHUNK;
    const chunk = await client.getLogs({ address: addresses, fromBlock: start, toBlock: end });
    for (const l of chunk) logs.push({ address: l.address, topics: l.topics as Hex[], data: l.data, block: l.blockNumber!.toString() });
    start = end + 1n;
  }
  writeCache({ from: from.toString(), to: latest.number.toString(), logs });
  return { logs, latestBlock: latest.number, latestTime: Number(latest.timestamp) };
}

const role = (name: string) => keccak256(toHex(name));
export const ROLE_NAMES: Record<Hex, string> = {
  [toHex(0, { size: 32 })]: "Admin",
  [role("GUARDIAN_ROLE")]: "Guardian",
  [role("KEEPER_ROLE")]: "Keeper",
  [role("PROPOSER_ROLE")]: "Proposer",
  [role("EXECUTOR_ROLE")]: "Executor",
  [role("CANCELLER_ROLE")]: "Canceller",
};

export type Flow = { vault: Address; wallet: Address; amount: bigint; time: number };
export type PendingOp = { id: Hex; target: Address; data: Hex; readyAt: number };

export type AdminSummary = {
  deposits: Flow[];
  withdrawals: Flow[];
  /** cbBTC (sats) the vault harvests sent to the treasury, with time. */
  harvestFees: { vault: Address; sats: bigint; time: number }[];
  /** What users claimed: cbBTC (sats) and, for Turbo claims without swap, WETH. */
  claims: { sats: bigint; weth: bigint; time: number }[];
  /** Turbo protocol fees: WETH and cbBTC, with time. */
  turboFees: { weth: bigint; sats: bigint; time: number }[];
  /** First deposit time per wallet. */
  firstSeen: Map<Address, number>;
  /** Current role holders: contract -> role name -> accounts. */
  roles: Map<Address, Map<string, Set<Address>>>;
  pendingOps: PendingOp[];
  lastHarvest: Map<Address, number>;
};

/** Turns the raw logs into flows, fees, users, roles and open timelock operations. */
export function summarize(live: Live, { logs, latestBlock, latestTime }: AdminLogs): AdminSummary {
  const d = live.deployment;
  const time = (block: string) => latestTime - Number(latestBlock - BigInt(block)) * BLOCK_SECONDS;
  const same = (a: string, b?: string) => Boolean(b) && a.toLowerCase() === b!.toLowerCase();

  const s: AdminSummary = {
    deposits: [],
    withdrawals: [],
    harvestFees: [],
    claims: [],
    turboFees: [],
    firstSeen: new Map(),
    roles: new Map(),
    pendingOps: [],
    lastHarvest: new Map(),
  };
  const scheduled = new Map<Hex, PendingOp>();
  const finished = new Set<Hex>();

  const grant = (contract: Address, roleId: Hex, account: Address, on: boolean) => {
    const name = ROLE_NAMES[roleId] ?? roleId.slice(0, 10);
    const byRole = s.roles.get(contract) ?? new Map<string, Set<Address>>();
    const holders = byRole.get(name) ?? new Set<Address>();
    if (on) holders.add(account);
    else holders.delete(account);
    byRole.set(name, holders);
    s.roles.set(contract, byRole);
  };

  for (const l of logs) {
    const abi = same(l.address, d.turboVault) ? turboVaultAbi : same(l.address, d.timelock) ? timelockAbi : btcYieldVaultAbi;
    let ev: { eventName: string; args: Record<string, unknown> };
    try {
      ev = decodeEventLog({ abi, topics: l.topics as [Hex, ...Hex[]], data: l.data, strict: false }) as typeof ev;
    } catch {
      continue; // e.g. ERC20 Transfer of shares, not needed here
    }
    const a = ev.args;
    const t = time(l.block);
    const vault = l.address;

    switch (ev.eventName) {
      case "Deposit": {
        const wallet = a.receiver as Address;
        s.deposits.push({ vault, wallet, amount: a.assets as bigint, time: t });
        if (!s.firstSeen.has(wallet)) s.firstSeen.set(wallet, t);
        break;
      }
      case "Withdraw":
        s.withdrawals.push({ vault, wallet: a.owner as Address, amount: a.assets as bigint, time: t });
        break;
      case "Harvest": {
        // Everything not credited to users went to the fee recipient (fee + yield earned while empty).
        const out = a.rewardsOut as bigint;
        s.harvestFees.push({ vault, sats: out - (a.userRewards as bigint), time: t });
        s.lastHarvest.set(vault, t);
        break;
      }
      case "Claim":
        // Bitcoin vaults: Claim(user, receiver, rewards); Turbo: Claim(user, receiver, cbbtcOut, wethOut).
        s.claims.push({ sats: (a.rewards ?? a.cbbtcOut) as bigint, weth: (a.wethOut as bigint | undefined) ?? 0n, time: t });
        break;
      case "FeesCollected":
        s.turboFees.push({ weth: a.protocol0 as bigint, sats: a.protocol1 as bigint, time: t });
        break;
      case "RoleGranted":
      case "RoleRevoked":
        grant(vault, a.role as Hex, a.account as Address, ev.eventName === "RoleGranted");
        break;
      case "CallScheduled":
        scheduled.set(a.id as Hex, {
          id: a.id as Hex,
          target: a.target as Address,
          data: a.data as Hex,
          readyAt: t + Number(a.delay as bigint),
        });
        break;
      case "CallExecuted":
      case "Cancelled":
        finished.add(a.id as Hex);
        break;
    }
  }
  s.pendingOps = [...scheduled.values()].filter((op) => !finished.has(op.id));
  return s;
}
