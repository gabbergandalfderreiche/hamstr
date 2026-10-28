"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hamster } from "@/components/Hamster";
import { Celebration } from "@/components/Celebration";
import { Logo } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { VAULTS, satsPerMonth, usdValue, type Vault } from "@/lib/vaults";
import { useT } from "@/i18n/client";

const SECONDS_PER_MONTH = 30 * 24 * 3600;
// Demo only: speeds up time so the sats counter visibly moves.
const DEMO_SPEED = 2_000;

type Positions = Record<string, number>;

const QUICK: Record<string, number[]> = {
  USDC: [50, 250, 1000],
  ETH: [0.05, 0.25, 1],
  cbBTC: [0.001, 0.005, 0.01],
};

/** Demo dashboard, shown when no contracts are deployed on the configured network. */
export function Dashboard() {
  const { t } = useT();
  const a = t.app;
  const fmtUsd = (n: number) =>
    n.toLocaleString(t.numberLocale, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const fmtSats = (n: number, digits = 0) =>
    n.toLocaleString(t.numberLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const [positions, setPositions] = useState<Positions>({});
  const [selected, setSelected] = useState<Vault>(VAULTS[0]);
  const [amount, setAmount] = useState("");
  const [earnedSats, setEarnedSats] = useState(0);
  const [bubble, setBubble] = useState<string | null>(null);
  const [mood, setMood] = useState<Vault["mood"]>("sparkle");
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const endCelebration = useCallback(() => setCelebrate(null), []);

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
  const selectedText = t.vaults[selected.id];

  function deposit() {
    if (!valid) return;
    setPositions((p) => ({ ...p, [selected.id]: (p[selected.id] ?? 0) + value }));
    setBubble(a.reactDeposit(String(value), selected.deposit));
    setCelebrate(a.celebrate(String(value), selected.deposit));
    setMood("happy");
    setAmount("");
  }

  function withdraw(v: Vault) {
    setPositions((p) => ({ ...p, [v.id]: 0 }));
    setBubble(a.reactWithdrawDemo);
    setMood("wink");
  }

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

      <div className="border-b border-line bg-surface-2 px-4 py-2 text-center text-xs font-semibold text-btc-ink">
        {a.demoBanner}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {/* Summary */}
        <section className="screentone card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto">
            <div className="bubble mb-3 max-w-56 text-sm">{bubble ?? a.bubbleIdle}</div>
            <Hamster size={150} mood={mood} animated sparkles={earnedSats > 0} className="mx-auto" title={t.brand.mascot} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={a.deposited} value={fmtUsd(totalUsd)} />
            <Stat
              label={a.earnedBtc}
              value={`${fmtSats(earnedSats, 2)} sats`}
              accent
              hint={`≈ ${(earnedSats / 1e8).toFixed(8)} BTC`}
            />
            <Stat label={a.feesPaid} value={`${fmtSats(feeSats, 2)} sats`} hint={a.feesPaidHint} />
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
          {/* Vault list */}
          <section>
            <h2 className="font-display text-xl font-extrabold">{a.vaultsTitle}</h2>
            <div className="mt-3 space-y-3">
              {VAULTS.map((v) => {
                const pos = positions[v.id] ?? 0;
                const active = v.id === selected.id;
                const text = t.vaults[v.id];
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
                        <div className="font-display font-extrabold">{text.name}</div>
                        <div className="text-xs text-muted">
                          {v.deposit} → {a.yieldIn} {v.payout} · {text.source}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="num font-bold">
                          {v.apy.toLocaleString(t.numberLocale, { minimumFractionDigits: 1 })} %
                        </div>
                        <div className="text-[10px] text-muted">{a.apyExample}</div>
                      </div>
                    </button>
                    {pos > 0 && (
                      <div className="border-l border-line pl-4 text-right">
                        <div className="num text-sm font-bold">
                          {pos} {v.deposit}
                        </div>
                        <button className="text-xs font-semibold text-btc-ink underline" onClick={() => withdraw(v)}>
                          {a.withdraw}
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
            <h2 className="font-display text-xl font-extrabold">{selectedText.name}</h2>
            <p className="mt-1 text-sm text-muted">{selectedText.summary}</p>

            <label className="mt-5 block text-xs font-bold text-muted" htmlFor="amount">
              {a.amount}
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
                <span className="text-muted">{a.perMonth}</span>
                <span className="num font-bold text-btc-ink">≈ {fmtSats(preview)} sats</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">{a.fee}</span>
                <span>{a.feeValue(10)}</span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-muted">{a.risk}</span>
                <span className="capitalize">{t.vaults.risk[selected.risk]}</span>
              </div>
            </div>

            {celebrate && <Celebration text={celebrate} onDone={endCelebration} />}
            <button className="btn btn-go mt-5 w-full" disabled={!valid} onClick={deposit}>
              {valid ? a.depositCta(String(value), selected.deposit) : a.enterAmount}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-muted">{selectedText.riskNote}</p>
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
