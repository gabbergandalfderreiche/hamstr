import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/LegalFooter";
import { Logo } from "@/components/Logo";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Hamster } from "@/components/Hamster";
import { GuideStepper } from "@/components/guide/GuideStepper";
import { BRAND } from "@/lib/brand";
import { localePath } from "@/i18n";
import { getDictionary, getLocale } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    title: `${t.guide.metaTitle} – ${BRAND.name}`,
    description: t.guide.sub,
    alternates: { languages: { de: "/de/start", en: "/en/start" } },
  };
}

/** Getting started: how a newcomer gets USDC/ETH onto Base before the first deposit. */
export default async function StartPage() {
  const t = await getDictionary();
  const locale = await getLocale();
  const g = t.guide;
  const appHref = localePath(locale, "/app");

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href={appHref} className="btn btn-primary !py-2 text-sm">
              {t.nav.openApp}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <section className="flex flex-col items-start gap-6 md:flex-row md:items-center">
          <Hamster size={110} mood="wink" animated sparkles title="" />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-btc-ink">{g.kicker}</div>
            <h1 className="mt-1 font-display text-4xl font-extrabold md:text-5xl">{g.title}</h1>
            <p className="mt-3 max-w-2xl text-muted">{g.sub}</p>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-xl font-extrabold">{g.needTitle}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {g.need.map((n, i) => (
              <div key={n.title} className="card flex gap-3 p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-btc font-extrabold text-[#2a1406]">{i + 1}</span>
                <div>
                  <div className="font-bold">{n.title}</div>
                  <p className="mt-0.5 text-sm text-muted">{n.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card mt-8 p-6 md:p-8">
          <h2 className="font-display text-xl font-extrabold">{g.pathsLabel}</h2>
          <div className="mt-4">
            <GuideStepper />
          </div>
        </section>

        <section className="card card-highlight mt-8 p-6">
          <h2 className="font-display text-xl font-extrabold">{g.warnTitle}</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {g.warn.map((w) => (
              <li key={w} className="flex gap-2">
                <span className="text-btc-ink" aria-hidden>
                  ★
                </span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-col items-start gap-3">
          <Link href={appHref} className="btn btn-primary">
            {g.cta} →
          </Link>
          <p className="max-w-2xl text-xs text-muted">{g.note}</p>
        </div>
      </main>

      <LegalFooter />
    </div>
  );
}
