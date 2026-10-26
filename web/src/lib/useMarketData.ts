"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { erc20Abi } from "viem";
import { btcYieldVaultAbi, oracleSwapperAbi, turboVaultAbi } from "@/generated/contracts";
import { AAVE_POOL, aavePoolAbi, rayRateToApy } from "./market";
import { getLive } from "./live";
import { activeChain } from "./network";
import { DEMO_BTC_USD, DEMO_ETH_USD, VAULTS } from "./vaults";

const REFRESH_MS = 30_000;
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
  /** cbBTC sitting in the Bitcoin vaults (harvested interest not yet claimed), in sats. */
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
        ]
      : [],
    query: { enabled, refetchInterval: REFRESH_MS },
  });
  const { data: turboAssets } = useReadContract({
    address: d?.turboVault,
    abi: turboVaultAbi,
    functionName: "totalAssets",
    query: { enabled: Boolean(d?.turboVault), refetchInterval: REFRESH_MS },
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
    btcSats: Number(btcInVaults),
  };
}
