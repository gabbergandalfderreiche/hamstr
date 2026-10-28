import Link from "next/link";
import { Hamster, HamsterPet } from "@/components/Hamster";
import { Logo } from "@/components/Logo";
import { LegalFooter } from "@/components/LegalFooter";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { HeroYieldCard, LiveStats, MaxiPitch, VaultApy, YieldCalculator } from "@/components/LiveYield";
import { TurboTeaser } from "@/components/turbo/TurboTeaser";
import { TAX_TOOL } from "@/lib/partners";
import { GermanFlag } from "@/components/GermanFlag";
import { Transparency } from "@/components/Transparency";
import { VAULTS } from "@/lib/vaults";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

const STEP_MOODS = ["sparkle", "happy", "wink"] as const;

export default async function Home() {
  const t = await getDictionary();
  const locale = await getLocale();
  const l = t.landing;
  const appHref = localePath(locale, "/app");

  return (
    <div className="flex flex-col">
      <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-semibold text-muted md:flex">
            <a href="#how" className="hover:text-ink">{t.nav.how}</a>
            <a href="#calculator" className="hover:text-ink">{t.nav.calc}</a>
            <a href="#vaults" className="hover:text-ink">{t.nav.vaults}</a>
            <a href="#safety" className="hover:text-ink">{t.nav.safety}</a>
            <Link href={localePath(locale, "/start")} className="hover:text-ink">{t.nav.guide}</Link>
          </nav>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href={appHref} className="btn btn-primary !py-2 text-sm">
              {t.nav.openApp}
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="screentone border-b border-line">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 md:grid-cols-2 md:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-bold text-muted">
                <span className="h-2 w-2 rounded-full bg-good" />
                {l.badge}
              </span>
              <h1 className="font-display mt-5 text-5xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
                {l.heroLine1}
                <br />
                <span className="text-btc">{l.heroLine2}</span>
              </h1>
              <p className="mt-5 max-w-md text-lg text-muted">{t.brand.description}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={appHref} className="btn btn-primary">
                  {l.ctaPrimary}
                </Link>
                <a href="#how" className="btn btn-ghost">
                  {l.ctaSecondary}
                </a>
              </div>
              <Link href={localePath(locale, "/start")} className="mt-4 inline-block text-sm font-semibold underline">
                {t.guide.link}
              </Link>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted">
                {l.trust.map((item) => (
                  <li key={item}>✓ {item}</li>
                ))}
              </ul>
            </div>

            <div className="relative mx-auto w-full max-w-sm">
              <div className="bubble pointer-events-none absolute -top-2 left-2 z-10 text-sm md:-left-6">{l.bubble}</div>
              <div className="mx-auto mt-10 aspect-square w-72 rounded-full bg-surface-2 p-4 md:w-80">
                {/* Easter egg: click and it turns around and wiggles. */}
                <HamsterPet size={288} sparkles animated className="h-full w-full [&>svg]:h-full [&>svg]:w-full" label={t.brand.pet} />
              </div>
              <HeroYieldCard />
            </div>
          </div>
        </section>

        <LiveStats />

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">{l.howTitle}</h2>
          <p className="mt-2 text-muted">{l.howSub}</p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {l.steps.map((s, i) => (
              <div key={s.title} className="card p-6">
                <div className="flex items-center gap-3">
                  <Hamster size={64} mood={STEP_MOODS[i]} coin={i === 2} title="" />
                  <span className="font-display text-sm font-extrabold text-btc-ink">{l.step(i + 1)}</span>
                </div>
                <h3 className="font-display mt-4 text-xl font-extrabold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bitcoin pitch */}
        <section className="mx-auto max-w-6xl px-4 pb-4">
          <MaxiPitch appHref={appHref} />
        </section>

        {/* Calculator */}
        <section id="calculator" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">{l.calc.title}</h2>
            <p className="mt-2 text-muted">{l.calc.sub}</p>
            <div className="mt-8">
              <YieldCalculator appHref={appHref} />
            </div>
            {TAX_TOOL.url && (
              <a
                href={TAX_TOOL.url}
                target="_blank"
                rel="noopener noreferrer"
                className="card mt-4 flex flex-col gap-3 p-5 transition hover:border-btc sm:flex-row sm:items-center"
              >
                <span className="flex w-fit items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">
                  <GermanFlag />
                  {l.taxTool.label}
                </span>
                <div className="flex-1">
                  <div className="font-display font-extrabold">{l.taxTool.title}</div>
                  <p className="text-sm text-muted">{l.taxTool.text}</p>
                </div>
                <span className="text-sm font-bold text-btc-ink">
                  {l.taxTool.cta} ↗<span className="block text-[10px] font-normal text-muted">{l.taxTool.note}</span>
                </span>
              </a>
            )}
          </div>
        </section>

        {/* Vaults */}
        <section id="vaults" className="border-y border-line bg-surface-2/60">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">{l.vaultsTitle}</h2>
            <p className="mt-2 text-muted">{l.vaultsSub}</p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {VAULTS.map((v) => {
                const text = t.vaults[v.id];
                const soon = v.id === "btc";
                return (
                  <div key={v.id} className={`card flex flex-col p-6 ${soon ? "opacity-80" : ""}`}>
                    <div className="flex items-start justify-between">
                      <Hamster size={72} mood={v.mood} title="" />
                      <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">
                        {soon ? t.app.soon : l.riskBadge(t.vaults.risk[v.risk])}
                      </span>
                    </div>
                    <h3 className="font-display mt-3 text-xl font-extrabold">{text.name}</h3>
                    <p className="mt-1 text-sm text-muted">{text.summary}</p>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted">{l.depositLabel}</dt>
                        <dd className="font-bold">{v.deposit}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">{l.payoutLabel}</dt>
                        <dd className="font-bold text-btc-ink">{v.payout}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted">{l.sourceLabel}</dt>
                        <dd className="font-bold">{text.source}</dd>
                      </div>
                      {soon ? (
                        <div>
                          <dt className="text-xs text-muted">{l.apyLabel}</dt>
                          <dd className="font-bold text-muted">–</dd>
                        </div>
                      ) : (
                        <VaultApy id={v.id} demoApy={v.apy} />
                      )}
                    </dl>
                    {soon ? (
                      <p className="mt-4 border-t border-line pt-3 text-xs font-semibold text-btc-ink">{l.btcSoon}</p>
                    ) : (
                      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">{text.riskNote}</p>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="mt-4">
              <TurboTeaser />
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="screentone border-y border-line">
          <div className="mx-auto max-w-6xl px-4 py-16">
            <h2 className="font-display text-3xl font-extrabold md:text-4xl">{l.safetyTitle}</h2>
            <p className="mt-2 text-muted">{l.safetySub}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {l.safety.map((s) => (
                <div key={s.title} className="card p-6">
                  <h3 className="font-display text-lg font-extrabold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.text}</p>
                </div>
              ))}
            </div>
            <Transparency />
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="mx-auto max-w-3xl px-4 py-16">
          <h2 className="font-display text-3xl font-extrabold md:text-4xl">{l.faqTitle}</h2>
          <div className="mt-6 space-y-3">
            {l.faq.map((f) => (
              <details key={f.q} className="card group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                  {f.q}
                  <span className="text-btc transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-4 pb-16">
          <div className="card flex flex-col items-center gap-6 bg-surface-2 p-8 text-center md:flex-row md:text-left">
            <Hamster size={120} mood="happy" animated sparkles title="" />
            <div className="flex-1">
              <h2 className="font-display text-2xl font-extrabold md:text-3xl">{l.ctaTitle}</h2>
              <p className="mt-1 text-muted">{l.ctaText}</p>
            </div>
            <Link href={appHref} className="btn btn-primary">
              {l.ctaPrimary}
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}
