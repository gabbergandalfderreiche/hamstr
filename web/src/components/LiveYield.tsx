"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMarketData } from "@/lib/useMarketData";
import { SHOW_AUM_FROM_USD } from "@/lib/market";
import { getLive } from "@/lib/live";
import { activeChain } from "@/lib/network";
import { useT } from "@/i18n/client";
import { Hamster } from "./Hamster";

const pct = (fraction: number, locale: string) =>
  `${(fraction * 100).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

const usd = (value: number, locale: string, digits = 0) =>
  value.toLocaleString(locale, { style: "currency", currency: "USD", maximumFractionDigits: digits });

/** Big yield number for the hero: the best current net yield. */
export function HeroYieldCard() {
  const { t } = useT();
  const m = useMarketData();
  return (
    <div className="card absolute -bottom-4 right-0 px-4 py-3 md:-right-6">
      <div className="text-xs font-semibold text-muted">{t.landing.heroCard.label}</div>
      <div className="num font-display text-2xl font-extrabold text-good">{pct(m.netApy.usdc, t.numberLocale)}</div>
      <div className="text-[10px] text-muted">{m.isLive ? t.landing.heroCard.hint : t.landing.heroCard.demo}</div>
    </div>
  );
}

/** Strip under the hero: live yields and assets under management. */
export function LiveStats() {
  const { t } = useT();
  const m = useMarketData();
  const l = t.landing.live;
  if (!m.isLive) return null;

  const vault = getLive(activeChain.id)?.deployment.usdcVault;
  const showAum = m.tvlUsd >= SHOW_AUM_FROM_USD;

  return (
    <section className="border-b border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 sm:grid-cols-3">
        <Stat label={l.apyUsdc} value={pct(m.netApy.usdc, t.numberLocale)} hint={l.apyHint} accent />
        <Stat label={l.apyEth} value={pct(m.netApy.eth, t.numberLocale)} hint={l.apyHint} accent />
        <Stat
          label={l.aum}
          value={showAum ? usd(m.tvlUsd, t.numberLocale) : l.aumSoon}
          hint={
            <>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                {showAum ? l.badge : l.aumSoonHint}
              </span>
              {vault && (
                <>
                  {" · "}
                  <a href={`https://basescan.org/address/${vault}`} className="underline" target="_blank" rel="noopener noreferrer">
                    {l.contracts}
                  </a>
                </>
              )}
            </>
          }
        />
      </div>
    </section>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint: ReactNode; accent?: boolean }) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`num font-display text-3xl font-extrabold ${accent ? "text-good" : ""}`}>{value}</div>
      <div className="text-xs text-muted">{hint}</div>
    </div>
  );
}

/** Net APY for one vault card; demo value until live data is available. */
export function VaultApy({ id, demoApy }: { id: "usdc" | "eth" | "btc"; demoApy: number }) {
  const { t } = useT();
  const m = useMarketData();
  const live = m.isLive && id !== "btc";
  const value = live ? pct(m.netApy[id as "usdc" | "eth"], t.numberLocale) : pct(demoApy / 100, t.numberLocale);
  return (
    <div>
      <dt className="text-xs text-muted">{live ? t.landing.apyLabel : t.landing.apyLabelDemo}</dt>
      <dd className={`num font-bold ${live ? "text-good" : ""}`}>{value}</dd>
    </div>
  );
}

/** "What's in it for me?" – principal stays, the yield becomes sats. */
export function YieldCalculator({ appHref }: { appHref: string }) {
  const { t, path } = useT();
  const m = useMarketData();
  const c = t.landing.calc;
  const [amount, setAmount] = useState(1000);
  const [asset, setAsset] = useState<"usdc" | "eth">("usdc");

  const yearlyUsd = amount * m.netApy[asset];
  const yearlySats = Math.round(yearlyUsd * m.satsPerUsd);
  const fmt = (n: number) => n.toLocaleString(t.numberLocale);

  return (
    <div className="card grid gap-6 p-6 md:grid-cols-2 md:p-8">
      <div>
        <label htmlFor="calc-amount" className="text-sm font-semibold text-muted">
          {c.amountLabel}
        </label>
        <div className="num font-display mt-1 text-4xl font-extrabold">{usd(amount, t.numberLocale)}</div>
        <input
          id="calc-amount"
          type="range"
          min={100}
          max={10_000}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
          className="mt-4 w-full accent-[var(--btc)]"
        />
        <div className="mt-4 grid grid-cols-2 rounded-full border border-line p-1 text-sm font-bold" role="tablist">
          {(["usdc", "eth"] as const).map((a) => (
            <button
              key={a}
              role="tab"
              aria-selected={asset === a}
              onClick={() => setAsset(a)}
              className={`rounded-full py-2 ${asset === a ? "bg-btc text-[#2a1406]" : "text-muted"}`}
            >
              {a === "usdc" ? c.inDollar : c.inEth}
            </button>
          ))}
        </div>
        <div className="mt-5 rounded-2xl bg-surface-2 p-4">
          <div className="text-xs font-semibold text-muted">{c.capitalLabel}</div>
          <div className="num font-bold">{usd(amount, t.numberLocale)}</div>
          <div className="text-xs text-muted">{c.capitalHint}</div>
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-3xl bg-surface-2 p-6">
        <div>
          <div className="text-sm font-semibold text-muted">{c.yearLabel}</div>
          <div className="num font-display mt-1 text-5xl font-extrabold text-btc-ink">+{fmt(yearlySats)} sats</div>
          <div className="num mt-1 text-lg font-bold text-good">{c.approx(usd(yearlyUsd, t.numberLocale, 2))}</div>
          <div className="num mt-1 text-sm text-muted">{c.perMonth(fmt(Math.round(yearlySats / 12)))}</div>
        </div>
        <div className="mt-6">
          <Link href={appHref} className="btn btn-primary w-full">
            {t.landing.ctaPrimary}
          </Link>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            {m.isLive ? c.footnote(m.feePct) : c.demo}{" "}
            <Link href={`${path()}#faq`} className="underline">
              {c.details}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

/** "Want more Bitcoin? Park dollars" – the core pitch for Bitcoin fans. */
export function MaxiPitch({ appHref }: { appHref: string }) {
  const { t } = useT();
  const m = useMarketData();
  const x = t.landing.maxi;
  return (
    <div className="card flex flex-col items-center gap-6 bg-surface-2 p-6 md:flex-row md:p-8">
      <Hamster size={140} mood="sparkle" sparkles title="" />
      <div className="flex-1">
        <h2 className="font-display text-3xl font-extrabold md:text-4xl">{x.title}</h2>
        <p className="mt-3 max-w-2xl text-muted">{x.text}</p>
        <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
          {x.points.map((p) => (
            <li key={p}>✓ {p}</li>
          ))}
          <li className="text-good">✓ {x.apy(pct(m.netApy.usdc, t.numberLocale))}</li>
        </ul>
      </div>
      <Link href={appHref} className="btn btn-primary shrink-0">
        {x.cta}
      </Link>
    </div>
  );
}
