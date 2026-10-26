import type { Metadata } from "next";
import { Dashboard } from "./Dashboard";
import { LiveDashboard } from "./LiveDashboard";
import { BetaGate } from "@/components/BetaGate";
import { LegalFooter } from "@/components/LegalFooter";
import { BRAND } from "@/lib/brand";
import { getLive } from "@/lib/live";
import { activeChain } from "@/lib/network";

export const metadata: Metadata = {
  title: `App – ${BRAND.name}`,
  alternates: { languages: { de: "/de/app", en: "/en/app" } },
};

export default function AppPage() {
  // Real contracts if they are deployed on the configured network, otherwise the demo.
  const live = getLive(activeChain.id);
  return (
    <BetaGate>
      {live ? <LiveDashboard live={live} /> : <Dashboard />}
      <LegalFooter />
    </BetaGate>
  );
}
