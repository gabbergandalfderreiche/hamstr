import type { Metadata } from "next";
import { Dashboard } from "./Dashboard";
import { LiveDashboard } from "./LiveDashboard";
import { BRAND } from "@/lib/brand";
import { getLive } from "@/lib/live";
import { activeChain } from "@/lib/network";

export const metadata: Metadata = {
  title: `App – ${BRAND.name}`,
};

export default function AppPage() {
  // Real contracts if they are deployed on the configured network, otherwise the demo.
  const live = getLive(activeChain.id);
  return live ? <LiveDashboard live={live} /> : <Dashboard />;
}
