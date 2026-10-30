"use client";

import { useReadContract } from "wagmi";
import type { Address } from "viem";
import { AAVE_POOL, aavePoolAbi, isSupplyBlocked } from "./market";

/**
 * True while Aave does not accept new supply of `asset` (reserve frozen or paused), e.g. after
 * Aave's emergency freeze following the Binance hack. Withdrawals keep working in that state.
 * Read live from the chain, so the deposit pause lifts itself once Aave unfreezes.
 */
export function useAaveSupplyBlocked(asset: Address | undefined) {
  const { data } = useReadContract({
    address: AAVE_POOL,
    abi: aavePoolAbi,
    functionName: "getConfiguration",
    args: asset ? [asset] : undefined,
    query: { enabled: Boolean(asset), refetchInterval: 60_000 },
  });
  return data !== undefined && isSupplyBlocked(data);
}
