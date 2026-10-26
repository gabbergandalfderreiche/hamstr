import type { Metadata } from "next";
import Link from "next/link";
import { BetaGate } from "@/components/BetaGate";
import { LegalFooter } from "@/components/LegalFooter";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ConnectButton } from "@/components/ConnectButton";
import { Hamster } from "@/components/Hamster";
import { TurboSimulator } from "@/components/turbo/TurboSimulator";
import { TurboGate } from "@/components/turbo/TurboGate";
import { TurboDashboard } from "@/components/turbo/TurboDashboard";
import { BRAND } from "@/lib/brand";
import { getLive } from "@/lib/live";
import { activeChain } from "@/lib/network";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.turbo.title} – ${BRAND.name}`,
    alternates: { languages: { de: "/de/turbo", en: "/en/turbo" } },
  };
}

export default async function TurboPage() {
  const t = await getDictionary();
  const locale = await getLocale();
  const tb = t.turbo;
  const live = getLive(activeChain.id);
  const vault = live?.deployment.turboVault;

  return (
    <BetaGate>
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

        <div className="border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-center text-xs font-bold text-red-600">
          {tb.banner}
        </div>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-4 py-8">
          <section className="flex flex-col items-start gap-6 md:flex-row md:items-center">
            <Hamster size={120} mood="wink" sparkles title="" />
            <div className="flex-1">
              <span className="rounded-full bg-red-500 px-2.5 py-1 text-xs font-bold text-white">{tb.badge}</span>
              <h1 className="font-display mt-3 text-4xl font-extrabold md:text-5xl">{tb.title}</h1>
              <p className="mt-2 max-w-2xl text-muted">{tb.tagline}</p>
              <Link href={localePath(locale, "/app")} className="mt-3 inline-block text-sm font-semibold underline">
                ← {tb.dash.back}
              </Link>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {tb.how.map((step, i) => (
              <div key={step} className="card p-5">
                <div className="font-display text-sm font-extrabold text-red-600">{i + 1}</div>
                <p className="mt-1 text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </section>

          <TurboSimulator />

          {vault && live ? (
            <TurboGate>
              <TurboDashboard live={live} vault={vault} />
            </TurboGate>
          ) : (
            <p className="card p-5 text-sm font-semibold text-muted">{tb.dash.notDeployed}</p>
          )}
        </main>
        <LegalFooter />
      </div>
    </BetaGate>
  );
}
