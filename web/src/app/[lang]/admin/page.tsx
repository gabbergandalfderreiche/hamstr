import type { Metadata } from "next";
import { AdminDashboard } from "./AdminDashboard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ConnectButton } from "@/components/ConnectButton";
import { Logo } from "@/components/Logo";
import { BRAND } from "@/lib/brand";
import { getLive } from "@/lib/live";
import { activeChain } from "@/lib/network";

export const metadata: Metadata = {
  title: `Admin – ${BRAND.name}`,
  // Operator page: keep it out of search results.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  const live = getLive(activeChain.id);
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ConnectButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {live ? <AdminDashboard live={live} /> : <p className="text-muted">No deployment on this network.</p>}
      </main>
    </div>
  );
}
