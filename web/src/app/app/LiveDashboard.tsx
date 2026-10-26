"use client";

import { useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hash } from "viem";
import { useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Hamster } from "@/components/Hamster";
import { Logo } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { btcYieldVaultAbi } from "@/generated/contracts";
import { wagmiConfig } from "@/lib/wagmi";
import { activeChain, NETWORK } from "@/lib/network";
import { VAULTS } from "@/lib/vaults";
import type { Live, LiveVault } from "@/lib/live";
import { useVaultState, type VaultState } from "./useVaultState";

type Mood = "sparkle" | "happy" | "wink";
type Mode = "deposit" | "withdraw";

function fmt(value: bigint, decimals: number, digits = 4) {
  const n = Number(formatUnits(value, decimals));
  return n.toLocaleString("de-CH", { maximumFractionDigits: digits });
}

function fmtSats(sats: bigint) {
  return Number(sats).toLocaleString("de-CH");
}

function errorText(e: unknown) {
  const err = e as { shortMessage?: string; message?: string };
  const msg = err.shortMessage ?? err.message ?? "Unbekannter Fehler";
  if (/rejected|denied/i.test(msg)) return "Abgebrochen.";
  return msg.split("\n")[0];
}

export function LiveDashboard({ live }: { live: Live }) {
  const { address, isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const usdc = useVaultState(live, live.vaults[0], address);
  const eth = useVaultState(live, live.vaults[1], address);
  const states: Record<LiveVault["id"], VaultState> = { usdc, eth };

  const [selectedId, setSelectedId] = useState<LiveVault["id"]>("usdc");
  const [bubble, setBubble] = useState("Was hamstern wir heute?");
  const [mood, setMood] = useState<Mood>("sparkle");

  const selected = live.vaults.find((v) => v.id === selectedId)!;
  const wrongChain = isConnected && chainId !== activeChain.id;

  const totalUsd = usdc.depositedUsd + eth.depositedUsd;
  const claimable = usdc.claimableSats + eth.claimableSats;
  const pendingSats = usdc.pendingSatsEstimate + eth.pendingSatsEstimate;
  const feeBps = usdc.performanceFeeBps || eth.performanceFeeBps;

  function react(text: string, m: Mood) {
    setBubble(text);
    setMood(m);
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
        {NETWORK === "fork"
          ? "Lokaler Base-Fork: echte Contracts, aber Testgeld. Zeit & Harvest per Script (local-harvest.sh)."
          : "Beta: Contracts noch nicht extern geprüft. Einzahlungen pro Person und insgesamt gedeckelt."}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {wrongChain && (
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-semibold">Deine Wallet ist im falschen Netzwerk.</span>
            <button className="btn btn-primary !py-2 text-sm" onClick={() => switchChain.mutate({ chainId: activeChain.id })}>
              Zu {activeChain.name} wechseln
            </button>
          </div>
        )}

        <section className="screentone card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto">
            <div className="bubble mb-3 max-w-56 text-sm">{isConnected ? bubble : "Melde dich an, dann geht's los!"}</div>
            <Hamster size={150} mood={mood} sparkles={claimable > 0n} className="float mx-auto" />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Eingezahlt" value={`$ ${fmt(totalUsd, 6, 2)}`} hint="Kapital, jederzeit abhebbar" />
            <Stat label="Abholbereit" value={`${fmtSats(claimable)} sats`} accent hint={`≈ ${fmt(claimable, 8, 8)} cbBTC`} />
            <Stat
              label="Wartet auf Umtausch"
              value={`≈ ${fmtSats(pendingSats)} sats`}
              hint={`nach ${feeBps / 100} % Gebühr etwas weniger`}
            />
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
          <section>
            <h2 className="font-display text-xl font-extrabold">Vaults</h2>
            <div className="mt-3 space-y-3">
              {live.vaults.map((lv) => {
                const info = VAULTS.find((v) => v.id === lv.id)!;
                const st = states[lv.id];
                const active = lv.id === selectedId;
                const fill = st.depositCap > 0n ? Number((st.totalSupply * 1000n) / st.depositCap) / 10 : 0;
                return (
                  <button
                    key={lv.id}
                    className={`card flex w-full items-center gap-4 p-4 text-left transition ${active ? "!border-btc" : ""}`}
                    onClick={() => {
                      setSelectedId(lv.id);
                      setMood(info.mood);
                    }}
                    aria-pressed={active}
                  >
                    <Hamster size={56} mood={info.mood} title="" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-extrabold">{info.name}</span>
                        {st.paused && <span className="rounded-full bg-blush/40 px-2 text-[10px] font-bold">pausiert</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {lv.symbol} → Rendite in cbBTC · {info.source}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-btc" style={{ width: `${Math.min(fill, 100)}%` }} />
                      </div>
                      <div className="num mt-1 text-[10px] text-muted">
                        {fmt(st.totalSupply, lv.decimals, 2)} / {fmt(st.depositCap, lv.decimals, 2)} {lv.symbol} Beta-Limit
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num text-sm font-bold">
                        {fmt(st.deposited, lv.decimals)} {lv.symbol}
                      </div>
                      <div className="num text-xs text-btc-ink">{fmtSats(st.claimableSats)} sats</div>
                    </div>
                  </button>
                );
              })}
              <div className="card flex items-center gap-4 p-4 opacity-60">
                <Hamster size={56} mood="wink" title="" />
                <div className="flex-1">
                  <div className="font-display font-extrabold">Voll-Hamster</div>
                  <div className="text-xs text-muted">cbBTC → mehr cbBTC</div>
                </div>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">bald</span>
              </div>
            </div>
          </section>

          <VaultPanel
            key={selected.id}
            vault={selected}
            state={states[selected.id]}
            user={address}
            disabled={!isConnected || wrongChain}
            onReact={react}
          />
        </div>
      </main>
    </div>
  );
}

function VaultPanel({
  vault,
  state,
  user,
  disabled,
  onReact,
}: {
  vault: LiveVault;
  state: VaultState;
  user: Address | undefined;
  disabled: boolean;
  onReact: (text: string, mood: Mood) => void;
}) {
  const info = VAULTS.find((v) => v.id === vault.id)!;
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const write = useWriteContract();

  let value = 0n;
  try {
    value = amount ? parseUnits(amount.replace(",", "."), vault.decimals) : 0n;
  } catch {
    value = 0n;
  }
  const limit = mode === "deposit" ? (state.walletBalance < state.maxDeposit ? state.walletBalance : state.maxDeposit) : state.deposited;
  const tooMuch = value > limit;
  const canSubmit = !disabled && !busy && value > 0n && !tooMuch;

  /** Shows `label` on the button while the transaction is signed and mined. */
  async function send(label: string, tx: () => Promise<Hash>) {
    setBusy(label);
    const hash = await tx();
    await waitForTransactionReceipt(wagmiConfig, { hash });
  }

  async function submit() {
    if (!user) return;
    setError(null);
    try {
      const v = { address: vault.address, abi: btcYieldVaultAbi } as const;
      if (mode === "deposit") {
        if (vault.native) {
          await send("Einzahlen…", () => write.mutateAsync({ ...v, functionName: "depositETH", args: [user], value }));
        } else {
          if (state.allowance < value) {
            await send("Freigeben…", () =>
              write.mutateAsync({
                address: vault.asset,
                abi: erc20Abi,
                functionName: "approve",
                args: [vault.address, value],
              }),
            );
          }
          await send("Einzahlen…", () => write.mutateAsync({ ...v, functionName: "deposit", args: [value, user] }));
        }
        onReact(`Mjam! ${amount} ${vault.symbol} in die Backen.`, "happy");
      } else {
        await send("Auszahlen…", () =>
          write.mutateAsync({
            ...v,
            functionName: vault.native ? "withdrawETH" : "withdraw",
            args: [value, user, user],
          }),
        );
        onReact("Kein Problem – dein Kapital ist zurück.", "wink");
      }
      setAmount("");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      state.refetch();
    }
  }

  async function claim() {
    if (!user) return;
    setError(null);
    try {
      await send("Abholen…", () =>
        write.mutateAsync({ address: vault.address, abi: btcYieldVaultAbi, functionName: "claim", args: [user] }),
      );
      onReact("Bitcoin gebunkert! Ab in deine Wallet.", "happy");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
      state.refetch();
    }
  }

  return (
    <section className="card self-start p-5">
      <h2 className="font-display text-xl font-extrabold">{info.name}</h2>
      <p className="mt-1 text-sm text-muted">{info.summary}</p>

      <div className="mt-5 rounded-2xl bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-muted">Abholbereit</div>
            <div className="num font-display text-2xl font-extrabold text-btc-ink">{fmtSats(state.claimableSats)} sats</div>
            {state.pendingSatsEstimate > 0n && (
              <div className="num text-xs text-muted">
                + ≈ {fmtSats(state.pendingSatsEstimate)} sats warten auf den nächsten Umtausch
              </div>
            )}
          </div>
          <button className="btn btn-primary !px-4 !py-2 text-sm" disabled={disabled || !!busy || state.claimableSats === 0n} onClick={claim}>
            Abholen
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-full border border-line p-1 text-sm font-bold" role="tablist">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`rounded-full py-2 ${mode === m ? "bg-btc text-[#2a1406]" : "text-muted"}`}
            onClick={() => {
              setMode(m);
              setAmount("");
              setError(null);
            }}
          >
            {m === "deposit" ? "Einzahlen" : "Auszahlen"}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-xs font-bold text-muted">
        <label htmlFor="amount">Betrag</label>
        <button className="num underline" onClick={() => setAmount(formatUnits(limit, vault.decimals))} disabled={limit === 0n}>
          {mode === "deposit" ? "Max" : "Alles"}: {fmt(limit, vault.decimals)} {vault.symbol}
        </button>
      </div>
      <div className="mt-1 flex items-center rounded-2xl border-[1.5px] border-line bg-bg px-4 focus-within:border-btc">
        <input
          id="amount"
          inputMode="decimal"
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="num w-full bg-transparent py-3 text-2xl font-bold outline-none"
        />
        <span className="font-bold text-muted">{vault.symbol}</span>
      </div>
      {tooMuch && (
        <p className="mt-2 text-xs font-semibold text-red-600">
          {mode === "deposit" ? "Mehr als dein Guthaben oder das Beta-Limit." : "Mehr als du eingezahlt hast."}
        </p>
      )}

      <div className="mt-4 space-y-1 rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">In deiner Wallet</span>
          <span className="num">
            {fmt(state.walletBalance, vault.decimals)} {vault.symbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Eingezahlt</span>
          <span className="num">
            {fmt(state.deposited, vault.decimals)} {vault.symbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Gebühr</span>
          <span>nur {state.performanceFeeBps / 100} % vom Gewinn</span>
        </div>
      </div>

      <button className="btn btn-primary mt-5 w-full" disabled={!canSubmit} onClick={submit}>
        {busy ??
          (disabled
            ? "Erst anmelden"
            : value === 0n
              ? "Betrag eingeben"
              : `${amount} ${vault.symbol} ${mode === "deposit" ? "hamstern" : "auszahlen"}`)}
      </button>
      {error && <p className="mt-3 text-xs font-semibold text-red-600">{error}</p>}
      <p className="mt-3 text-xs leading-relaxed text-muted">{info.riskNote}</p>
    </section>
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
