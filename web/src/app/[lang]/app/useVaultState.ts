"use client";

import { erc20Abi, zeroAddress, type Address } from "viem";
import { useBalance, useReadContracts } from "wagmi";
import { btcYieldVaultAbi, oracleSwapperAbi } from "@/generated/contracts";
import type { Live, LiveVault } from "@/lib/live";

const REFRESH_MS = 4_000;

export type VaultState = ReturnType<typeof useVaultState>;

/** Everything the dashboard shows for one vault, read from chain and refreshed every few seconds. */
export function useVaultState(live: Live, vault: LiveVault, user: Address | undefined) {
  const who = user ?? zeroAddress;
  const v = { address: vault.address, abi: btcYieldVaultAbi } as const;

  const reads = useReadContracts({
    contracts: [
      { ...v, functionName: "totalSupply" },
      { ...v, functionName: "depositCap" },
      { ...v, functionName: "performanceFee" },
      { ...v, functionName: "paused" },
      { ...v, functionName: "maxDeposit", args: [who] },
      { ...v, functionName: "balanceOf", args: [who] },
      { ...v, functionName: "positionOf", args: [who] },
      { address: vault.asset, abi: erc20Abi, functionName: "allowance", args: [who, vault.address] },
      { address: vault.asset, abi: erc20Abi, functionName: "balanceOf", args: [who] },
    ],
    query: { refetchInterval: REFRESH_MS },
  });

  const native = useBalance({
    address: user,
    query: { enabled: Boolean(user) && vault.native, refetchInterval: REFRESH_MS },
  });

  const r = reads.data;
  const deposited = (r?.[5]?.result as bigint | undefined) ?? 0n;
  const position = r?.[6]?.result as readonly [bigint, bigint] | undefined;
  const pendingCredit = position?.[1] ?? 0n;

  // Chainlink-based estimates: what the pending credit will roughly become in sats, and the USD value.
  const s = { address: live.deployment.swapper, abi: oracleSwapperAbi, functionName: "quote" } as const;
  const quotes = useReadContracts({
    contracts: [
      { ...s, args: [vault.asset, live.deployment.cbbtc, pendingCredit] },
      { ...s, args: [vault.asset, live.deployment.usdc, deposited] },
    ],
    query: { refetchInterval: REFRESH_MS },
  });

  return {
    totalSupply: (r?.[0]?.result as bigint | undefined) ?? 0n,
    depositCap: (r?.[1]?.result as bigint | undefined) ?? 0n,
    performanceFeeBps: Number((r?.[2]?.result as bigint | undefined) ?? 0n),
    paused: (r?.[3]?.result as boolean | undefined) ?? false,
    maxDeposit: (r?.[4]?.result as bigint | undefined) ?? 0n,
    deposited,
    claimableSats: position?.[0] ?? 0n,
    pendingCredit,
    pendingSatsEstimate: (quotes.data?.[0]?.result as bigint | undefined) ?? 0n,
    depositedUsd: (quotes.data?.[1]?.result as bigint | undefined) ?? 0n, // 6 decimals
    allowance: (r?.[7]?.result as bigint | undefined) ?? 0n,
    walletBalance: vault.native ? (native.data?.value ?? 0n) : ((r?.[8]?.result as bigint | undefined) ?? 0n),
    loaded: Boolean(r),
    refetch: () => {
      reads.refetch();
      quotes.refetch();
      native.refetch();
    },
  };
}
