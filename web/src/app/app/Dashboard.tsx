"use client";

import { useEffect, useMemo, useState } from "react";
import { Hamster } from "@/components/Hamster";
import { Logo } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { VAULTS, satsPerMonth, usdValue, type Vault } from "@/lib/vaults";

const SECONDS_PER_MONTH = 30 * 24 * 3600;
// Demo only: speeds up time so the sats counter visibly moves.
const DEMO_SPEED = 2_000;

type Positions = Record<string, number>;

const QUICK: Record<string, number[]> = {
  USDC: [50, 250, 1000],
  ETH: [0.05, 0.25, 1],
  cbBTC: [0.001, 0.005, 0.01],
};

function fmtUsd(n: number) {
  return n.toLocaleString("de-CH", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function fmtSats(n: number, digits = 0) {
  return n.toLocaleString("de-CH", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function Dashboard() {
  const [positions, setPositions] = useState<Positions>({});
  const [selected, setSelected] = useState<Vault>(VAULTS[0]);
  const [amount, setAmount] = useState("");
  const [earnedSats, setEarnedSats] = useState(0);
  const [bubble, setBubble] = useState("Was hamstern wir heute?");
  const [mood, setMood] = useState<Vault["mood"]>("sparkle");

  const satsPerSecond = useMemo(
    () =>
      VAULTS.reduce((sum, v) => sum + satsPerMonth(v, positions[v.id] ?? 0), 0) / SECONDS_PER_MONTH,
    [positions],
  );

  useEffect(() => {
    if (satsPerSecond === 0) return;
    const id = setInterval(() => setEarnedSats((s) => s + (satsPerSecond * DEMO_SPEED) / 10), 100);
    return () => clearInterval(id);
  }, [satsPerSecond]);

  const totalUsd = VAULTS.reduce((sum, v) => sum + usdValue(v.deposit, positions[v.id] ?? 0), 0);
  // 10% performance fee: users keep 90%, so the fee is 1/9 of what they earned.
  const feeSats = earnedSats / 9;

  const value = Number(amount.replace(",", "."));
  const valid = Number.isFinite(value) && value > 0;
  const preview = valid ? satsPerMonth(selected, value) : 0;

  function deposit() {
    if (!valid) return;
    setPositions((p) => ({ ...p, [selected.id]: (p[selected.id] ?? 0) + value }));
    setBubble(`Mjam! ${value} ${selected.deposit} in die Backen.`);
    setMood("happy");
    setAmount("");
  }

  function withdraw(v: Vault) {
    setPositions((p) => ({ ...p, [v.id]: 0 }));
    setBubble("Kein Problem – auszahlen geht immer.");
    setMood("wink");
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Logo />
          <ConnectButton />
        </div>
      </header>

      <div className="border-b border-line bg-surface-2 px-4 py-2 text-center text-xs font-semibold text-btc-ink">
        Demo-Modus: Einzahlungen werden nur simuliert, die Zeit läuft im Zeitraffer. Noch kein echtes Geld.
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Summary */}
        <section className="screentone card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto">
            <div className="bubble mb-3 max-w-56 text-sm">{bubble}</div>
            <Hamster size={150} mood={mood} sparkles={earnedSats > 0} className="float mx-auto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Eingezahlt" value={fmtUsd(totalUsd)} />
            <Stat
              label="Gehamsterte Bitcoin"
              value={`${fmtSats(earnedSats, 2)} sats`}
              accent
              hint={`≈ ${(earnedSats / 1e8).toFixed(8)} BTC`}
            />
            <Stat label="Bezahlte Gebühren" value={`${fmtSats(feeSats, 2)} sats`} hint="10 % vom Gewinn" />
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Vault list */}
          <section>
            <h2 className="font-display text-xl font-extrabold">Vaults</h2>
            <div className="mt-3 space-y-3">
              {VAULTS.map((v) => {
                const pos = positions[v.id] ?? 0;
                const active = v.id === selected.id;
                return (
                  <div
                    key={v.id}
                    className={`card flex items-center gap-4 p-4 transition ${active ? "!border-btc" : ""}`}
                  >
                    <button
                      className="flex flex-1 items-center gap-4 text-left"
                      onClick={() => {
                        setSelected(v);
                        setMood(v.mood);
                      }}
                      aria-pressed={active}
                    >
                      <Hamster size={56} mood={v.mood} title="" />
                      <div className="flex-1">
                        <div className="font-display font-extrabold">{v.name}</div>
                        <div className="text-xs text-muted">
                          {v.deposit} → Rendite in {v.payout} · {v.source}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="num font-bold">{v.apy.toFixed(1)} %</div>
                        <div className="text-[10px] text-muted">APY Beispiel</div>
                      </div>
                    </button>
                    {pos > 0 && (
                      <div className="border-l border-line pl-4 text-right">
                        <div className="num text-sm font-bold">
                          {pos} {v.deposit}
                        </div>
                        <button className="text-xs font-semibold text-btc-ink underline" onClick={() => withdraw(v)}>
                          Auszahlen
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* Deposit panel */}
          <section className="card self-start p-5">
            <h2 className="font-display text-xl font-extrabold">{selected.name}</h2>
            <p className="mt-1 text-sm text-muted">{selected.summary}</p>

            <label className="mt-5 block text-xs font-bold text-muted" htmlFor="amount">
              Betrag
            </label>
            <div className="mt-1 flex items-center rounded-2xl border-[1.5px] border-line bg-bg px-4 focus-within:border-btc">
              <input
                id="amount"
                inputMode="decimal"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="num w-full bg-transparent py-3 text-2xl font-bold outline-none"
              />
              <span className="font-bold text-muted">{selected.deposit}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {QUICK[selected.deposit].map((q) => (
                <button
                  key={q}
                  className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-btc"
                  onClick={() => setAmount(String(q))}
                >
                  {q} {selected.deposit}
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-surface-2 p-4 text-sm">
              <div className="flex justify-between">
                <span className="text-muted">Geschätzt pro Monat</span>
                <span className="num font-bold text-btc-ink">≈ {fmtSats(preview)} sats</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">Gebühr</span>
                <span>nur 10 % vom Gewinn</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">Risiko</span>
                <span className="capitalize">{selected.risk}</span>
              </div>
            </div>

            <button className="btn btn-primary mt-5 w-full" disabled={!valid} onClick={deposit}>
              {valid ? `${value} ${selected.deposit} hamstern` : "Betrag eingeben"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-muted">{selected.riskNote}</p>
          </section>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-surface/80 p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`num font-display mt-1 text-2xl font-extrabold ${accent ? "text-btc-ink" : ""}`}>{value}</div>
      {hint && <div className="num text-xs text-muted">{hint}</div>}
    </div>
  );
}
