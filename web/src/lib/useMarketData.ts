"use client";

import { useQuery } from "@tanstack/react-query";
import { usePublicClient, useReadContracts } from "wagmi";
import { erc20Abi, parseAbi } from "viem";
import { btcYieldVaultAbi, oracleSwapperAbi, turboVaultAbi } from "@/generated/contracts";
import { AAVE_POOL, aavePoolAbi, rayRateToApy } from "./market";
import { getLive } from "./live";
import { activeChain } from "./network";
import { DEMO_BTC_USD, DEMO_ETH_USD, VAULTS } from "./vaults";

const REFRESH_MS = 30_000;
const MAX_BPS = 10_000n;

// Uniswap's position manager: simulating collect() as the Turbo vault returns the fees earned so far.
const positionManagerAbi = parseAbi([
  "function collect((uint256 tokenId, address recipient, uint128 amount0Max, uint128 amount1Max)) payable returns (uint256 amount0, uint256 amount1)",
]);
const MAX_UINT128 = 2n ** 128n - 1n;
const live = getLive(activeChain.id);
const d = live?.deployment;

export type MarketData = {
  /** True when the numbers come from the chain, false for demo values. */
  isLive: boolean;
  /** Net APY for users (after the performance fee), as a fraction. */
  netApy: { usdc: number; eth: number };
  feePct: number;
  /** Sats one US dollar buys right now. */
  satsPerUsd: number;
  /** ETH price in USD. */
  ethUsd: number;
  /** Assets in all vaults (incl. Turbo), in USD. */
  tvlUsd: number;
  /** Per vault: amount in the vault's own unit (USDC or ETH) and in USD. */
  tvl: { usdc: number; eth: number; ethUsd: number; turbo: number; turboUsd: number };
  /**
   * Earned but not yet claimed, in sats (with decimals): cbBTC waiting in the Bitcoin vaults, their
   * interest not yet swapped (after the fee) and the users' Turbo fees.
   */
  btcSats: number;
};

const DEMO: MarketData = {
  isLive: false,
  netApy: {
    usdc: (VAULTS.find((v) => v.id === "usdc")!.apy / 100) * 0.9,
    eth: (VAULTS.find((v) => v.id === "eth")!.apy / 100) * 0.9,
  },
  feePct: 10,
  satsPerUsd: 1e8 / DEMO_BTC_USD,
  ethUsd: DEMO_ETH_USD,
  tvlUsd: 0,
  tvl: { usdc: 0, eth: 0, ethUsd: 0, turbo: 0, turboUsd: 0 },
  btcSats: 0,
};

/** Live yields, BTC price and AuM for the landing page and app (demo values without a deployment). */
export function useMarketData(): MarketData {
  const enabled = Boolean(d);
  const vault = (address: `0x${string}`) => ({ address, abi: btcYieldVaultAbi }) as const;
  const quote = (tokenIn: `0x${string}`, tokenOut: `0x${string}`, amount: bigint) =>
    ({ address: d!.swapper, abi: oracleSwapperAbi, functionName: "quote", args: [tokenIn, tokenOut, amount] }) as const;

  const { data } = useReadContracts({
    contracts: enabled
      ? [
          { address: AAVE_POOL, abi: aavePoolAbi, functionName: "getReserveData", args: [d!.usdc] },
          { address: AAVE_POOL, abi: aavePoolAbi, functionName: "getReserveData", args: [d!.weth] },
          { ...vault(d!.usdcVault), functionName: "performanceFee" },
          { ...vault(d!.usdcVault), functionName: "totalAssets" },
          { ...vault(d!.ethVault), functionName: "totalAssets" },
          quote(d!.usdc, d!.cbbtc, 1_000_000n), // sats per 1 USDC
          quote(d!.weth, d!.usdc, 10n ** 18n), // USDC per 1 ETH
          { address: d!.cbbtc, abi: erc20Abi, functionName: "balanceOf", args: [d!.usdcVault] },
          { address: d!.cbbtc, abi: erc20Abi, functionName: "balanceOf", args: [d!.ethVault] },
          // Interest earned but not yet swapped: booked (pendingYield) plus still accruing at Aave.
          { ...vault(d!.usdcVault), functionName: "pendingYield" },
          { ...vault(d!.usdcVault), functionName: "unrealizedYield" },
          { ...vault(d!.ethVault), functionName: "pendingYield" },
          { ...vault(d!.ethVault), functionName: "unrealizedYield" },
        ]
      : [],
    query: { enabled, refetchInterval: REFRESH_MS },
  });
  const turbo = d?.turboVault ? ({ address: d.turboVault, abi: turboVaultAbi } as const) : undefined;
  const { data: turboData } = useReadContracts({
    contracts: turbo
      ? [
          { ...turbo, functionName: "totalAssets" },
          { ...turbo, functionName: "positionManager" },
          { ...turbo, functionName: "positionId" },
          { ...turbo, functionName: "performanceFee" },
          { ...turbo, functionName: "reserved0" },
          { ...turbo, functionName: "reserved1" },
        ]
      : [],
    query: { enabled: Boolean(turbo), refetchInterval: REFRESH_MS },
  });
  const turboAssets = turboData?.[0]?.result as bigint | undefined;
  const positionManager = turboData?.[1]?.result as `0x${string}` | undefined;
  const positionId = (turboData?.[2]?.result as bigint | undefined) ?? 0n;
  // Fees still sitting in the Uniswap position (WETH, cbBTC); collected on the next deposit, withdraw or claim.
  // Plain eth_call: wagmi's simulate hook waits for a connected wallet, this works for every visitor.
  const client = usePublicClient();
  const uncollected = useQuery({
    queryKey: ["turbo-uncollected", positionManager, positionId.toString()],
    queryFn: async () => {
      const { result } = await client!.simulateContract({
        address: positionManager!,
        abi: positionManagerAbi,
        functionName: "collect",
        args: [{ tokenId: positionId, recipient: d!.turboVault!, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
        account: d!.turboVault!,
      });
      return result;
    },
    enabled: Boolean(client && positionManager) && positionId > 0n,
    refetchInterval: REFRESH_MS,
  });

  if (!enabled || !data) return DEMO;

  const usdcReserve = data[0]?.result as { currentLiquidityRate: bigint } | undefined;
  const ethReserve = data[1]?.result as { currentLiquidityRate: bigint } | undefined;
  const feeBps = Number((data[2]?.result as bigint | undefined) ?? 1000n);
  const usdcTvl = (data[3]?.result as bigint | undefined) ?? 0n;
  const ethTvl = (data[4]?.result as bigint | undefined) ?? 0n;
  const satsPerUsdc = data[5]?.result as bigint | undefined;
  const usdcPerEth = data[6]?.result as bigint | undefined;
  const btcInVaults = ((data[7]?.result as bigint | undefined) ?? 0n) + ((data[8]?.result as bigint | undefined) ?? 0n);
  if (!usdcReserve || !ethReserve || !satsPerUsdc || !usdcPerEth) return DEMO;

  const keep = 1 - feeBps / 10_000;
  // Turbo fees users can claim: already reserved for them plus fresh ones after the protocol fee.
  const turboFee = (turboData?.[3]?.result as bigint | undefined) ?? 0n;
  const [fresh0, fresh1] = uncollected.data ?? [0n, 0n];
  const toUsers = (amount: bigint) => amount - (amount * turboFee) / MAX_BPS;
  const turboWeth = ((turboData?.[4]?.result as bigint | undefined) ?? 0n) + toUsers(fresh0);
  const turboCbbtc = ((turboData?.[5]?.result as bigint | undefined) ?? 0n) + toUsers(fresh1);
  const satsPerEth = (satsPerUsdc * usdcPerEth) / 1_000_000n;
  const turboSats = turboCbbtc + (turboWeth * satsPerEth) / 10n ** 18n;
  const big = (i: number) => (data[i]?.result as bigint | undefined) ?? 0n;
  const interestSats =
    (Number(big(9) + big(10)) / 1e6) * Number(satsPerUsdc) * keep + (Number(big(11) + big(12)) / 1e18) * Number(satsPerEth) * keep;
  const ethUsd = Number(usdcPerEth) / 1e6;
  const tvl = {
    usdc: Number(usdcTvl) / 1e6,
    eth: Number(ethTvl) / 1e18,
    ethUsd: (Number(ethTvl) / 1e18) * ethUsd,
    turbo: Number(turboAssets ?? 0n) / 1e18,
    turboUsd: (Number(turboAssets ?? 0n) / 1e18) * ethUsd,
  };
  return {
    isLive: true,
    netApy: {
      usdc: rayRateToApy(usdcReserve.currentLiquidityRate) * keep,
      eth: rayRateToApy(ethReserve.currentLiquidityRate) * keep,
    },
    feePct: feeBps / 100,
    satsPerUsd: Number(satsPerUsdc),
    ethUsd,
    tvlUsd: tvl.usdc + tvl.ethUsd + tvl.turboUsd,
    tvl,
    btcSats: Number(btcInVaults + turboSats) + interestSats,
  };
}
