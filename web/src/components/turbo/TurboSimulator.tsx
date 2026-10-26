"use client";

import { useState } from "react";
import { simulateTurbo } from "@/lib/il";
import { useT } from "@/i18n/client";

/** Slider: "what if ETH moves X % against BTC" – Turbo vs. keeping ETH vs. holding half/half. */
export function TurboSimulator() {
  const { t } = useT();
  const il = t.turbo.il;
  const [move, setMove] = useState(-20);
  const r = simulateTurbo(move);

  const fmt = (n: number) => n.toLocaleString(t.numberLocale, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const max = Math.max(r.turbo, r.keepEth, r.fiftyFifty);
  const rows = [
    { label: il.turbo, value: r.turbo, color: "bg-red-500" },
    { label: il.keep, value: r.keepEth, color: "bg-muted" },
    { label: il.fiftyFifty, value: r.fiftyFifty, color: "bg-btc" },
  ];

  return (
    <div className="card border-red-400/60 p-6">
      <h3 className="font-display text-2xl font-extrabold">{il.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{il.explain}</p>

      <label htmlFor="il-move" className="mt-6 block text-sm font-semibold">
        {il.sliderLabel}{" "}
        <span className="font-display text-lg font-extrabold">
          {move > 0 ? il.up(move) : move < 0 ? il.down(-move) : il.flat}
        </span>
      </label>
      <input
        id="il-move"
        type="range"
        min={-50}
        max={50}
        step={5}
        value={move}
        onChange={(e) => setMove(Number(e.target.value))}
        className="mt-3 w-full accent-red-500"
      />

      <div className="mt-2 text-xs text-muted">{il.perEth}</div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex justify-between text-sm">
              <span>{row.label}</span>
              <span className="num font-bold">{fmt(row.value)} ETH</span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-surface-2">
              <div className={`h-full ${row.color}`} style={{ width: `${(row.value / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <p className="num mt-4 rounded-2xl bg-red-500/10 px-4 py-2 text-sm font-bold text-red-600">
        {il.loss((r.impermanentLoss * 100).toLocaleString(t.numberLocale, { maximumFractionDigits: 1 }))}
      </p>
      <p className="mt-3 text-xs leading-relaxed text-muted">{il.fees}</p>
      <p className="mt-2 text-sm font-bold">{il.final}</p>
    </div>
  );
}
