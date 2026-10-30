"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchAdminLogs, summarize } from "./adminLogs";
import { getLive } from "./live";
import { activeChain } from "./network";

/**
 * Sats users have claimed so far, summed from the vaults' Claim events (Turbo WETH payouts at
 * today's price). Shares the browser cache with the admin dashboard, so later visits only load new blocks.
 */
export function useClaimedSats(enabled: boolean, satsPerUsd: number, ethUsd: number) {
  const live = getLive(activeChain.id);
  const totals = useQuery({
    queryKey: ["claimed-totals", live?.deployment.usdcVault],
    queryFn: async () => {
      const { claims } = summarize(live!, await fetchAdminLogs(live!));
      return claims.reduce((sum, c) => ({ sats: sum.sats + c.sats, weth: sum.weth + c.weth }), { sats: 0n, weth: 0n });
    },
    enabled: enabled && Boolean(live),
    staleTime: 120_000,
    refetchInterval: 300_000,
  });
  if (!totals.data) return undefined;
  return Number(totals.data.sats) + (Number(totals.data.weth) / 1e18) * ethUsd * satsPerUsd;
}
