"use client";

import { useState } from "react";
import { simulateTurbo } from "@/lib/il";
import { useMarketData } from "@/lib/useMarketData";
import { useT } from "@/i18n/client";

/** Fee earnings for an amount and period in three realistic scenarios, plus one plain-language risk line. */
export function TurboSimulator() {
  const { t } = useT();
  const il = t.turbo.il;
  const m = useMarketData();
  const [amount, setAmount] = useState("0.1");
  const [months, setMonths] = useState(12);

  const eth = Math.max(0, Number(amount.replace(",", ".")) || 0);
  const loc = t.numberLocale;
  const fmt = (n: number, digits: number) => n.toLocaleString(loc, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  // Same example the old slider showed by default: ETH −20 % against BTC.
  const ilExample = (simulateTurbo(-20).impermanentLoss * 100).toLocaleString(loc, { maximumFractionDigits: 0 });

  return (
    <div className="card p-6">
      <h3 className="font-display text-2xl font-extrabold">{il.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{il.explain}</p>

      <div className="mt-5 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="text-xs font-semibold text-muted">{il.amountLabel}</span>
          <span className="mt-1 flex items-center gap-2 rounded-2xl border border-line bg-surface-2 px-3 py-2">
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="num w-24 bg-transparent font-display text-lg font-extrabold outline-none"
            />
            <span className="font-bold text-muted">ETH</span>
          </span>
        </label>
        <div>
          <span className="text-xs font-semibold text-muted">{il.periodLabel}</span>
          <div className="mt-1 flex gap-1.5">
            {il.periods.map((p) => (
              <button
                key={p.months}
                onClick={() => setMonths(p.months)}
                aria-pressed={p.months === months}
                className={`btn !px-3 !py-2 text-sm ${p.months === months ? "btn-primary" : "btn-ghost"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {il.scenarios.map((s) => {
          const earned = eth * (s.apy / 100) * (months / 12);
          const usd = earned * m.ethUsd;
          const sats = Math.round(usd * m.satsPerUsd);
          return (
            <div key={s.apy} className={`rounded-2xl p-4 ${s.apy === 12 ? "bg-btc/15 ring-2 ring-btc" : "bg-surface-2"}`}>
              <div className="text-xs font-semibold text-muted">{s.label}</div>
              <div className="font-display text-sm font-extrabold text-btc-ink">{il.perYear(s.apy)}</div>
              <div className="num mt-2 font-display text-2xl font-extrabold text-good">+{fmt(earned, 4)} ETH</div>
              <div className="num text-xs text-muted">
                ≈ {sats.toLocaleString(loc)} sats · ≈ {usd.toLocaleString(loc, { style: "currency", currency: "USD", maximumFractionDigits: 2 })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted">{il.basis}</p>
      <p className="mt-4 rounded-2xl bg-red-500/10 px-4 py-3 text-sm leading-relaxed text-red-600">{il.risk(ilExample)}</p>
      <p className="mt-2 text-xs font-bold">{il.final}</p>
    </div>
  );
}
