"use client";

import { useCallback, useState } from "react";
import { erc20Abi, formatUnits, parseUnits, type Address, type Hash } from "viem";
import { useConnection, useEstimateFeesPerGas, useSwitchChain } from "wagmi";
import { useAttributedWrite } from "@/lib/attribution";
import { waitForTransactionReceipt } from "wagmi/actions";
import { Hamster } from "@/components/Hamster";
import { Logo } from "@/components/Logo";
import { ConnectButton } from "@/components/ConnectButton";
import { useConnectModal } from "@/components/ConnectModal";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { btcYieldVaultAbi } from "@/generated/contracts";
import { wagmiConfig } from "@/lib/wagmi";
import { activeChain, NETWORK } from "@/lib/network";
import { VAULTS } from "@/lib/vaults";
import type { Live, LiveVault } from "@/lib/live";
import type { Dictionary } from "@/i18n";
import { useT } from "@/i18n/client";
import { useMarketData } from "@/lib/useMarketData";
import { TurboTeaser } from "@/components/turbo/TurboTeaser";
import { FundingHint } from "@/components/guide/FundingHint";
import { TestRun } from "./TestRun";
import { Celebration } from "@/components/Celebration";
import { useVaultState, type VaultState } from "./useVaultState";
import { refetchSoon, spendableEth, txUrl } from "@/lib/tx";

type Mood = "sparkle" | "happy" | "wink";
type Mode = "deposit" | "withdraw";

function formatters(locale: string) {
  return {
    fmt: (value: bigint, decimals: number, digits = 4) =>
      Number(formatUnits(value, decimals)).toLocaleString(locale, { maximumFractionDigits: digits }),
    fmtSats: (sats: bigint) => Number(sats).toLocaleString(locale),
  };
}

function errorText(e: unknown, t: Dictionary) {
  const err = e as { shortMessage?: string; message?: string };
  const msg = err.shortMessage ?? err.message ?? t.app.unknownError;
  if (/rejected|denied/i.test(msg)) return t.app.cancelled;
  return msg.split("\n")[0];
}

export function LiveDashboard({ live }: { live: Live }) {
  const { t } = useT();
  const a = t.app;
  const { fmt, fmtSats } = formatters(t.numberLocale);
  const { address, isConnected, chainId } = useConnection();
  const switchChain = useSwitchChain();
  const market = useMarketData();
  const apyText = (id: LiveVault["id"]) =>
    `${(market.netApy[id] * 100).toLocaleString(t.numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} % p.a.`;
  const usdc = useVaultState(live, live.vaults[0], address);
  const eth = useVaultState(live, live.vaults[1], address);
  const states: Record<LiveVault["id"], VaultState> = { usdc, eth };

  const [selectedId, setSelectedId] = useState<LiveVault["id"]>("usdc");
  const [bubble, setBubble] = useState<string | null>(null);
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
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <ConnectButton />
          </div>
        </div>
      </header>

      <div className="border-b border-line bg-surface-2 px-4 py-2 text-center text-xs font-semibold text-btc-ink">
        {NETWORK === "fork" ? a.forkBanner : a.betaBanner}
      </div>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {wrongChain && (
          <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-semibold">{a.wrongNetwork}</span>
            <button className="btn btn-primary !py-2 text-sm" onClick={() => switchChain.mutate({ chainId: activeChain.id })}>
              {a.switchTo(activeChain.name)}
            </button>
          </div>
        )}

        <TestRun live={live} states={states} user={address} disabled={!isConnected || wrongChain} />

        <section className="screentone card grid items-center gap-6 overflow-hidden p-6 md:grid-cols-[auto_1fr]">
          <div className="relative mx-auto">
            <div className="bubble mb-3 max-w-56 text-sm">{isConnected ? (bubble ?? a.bubbleIdle) : a.bubbleLogin}</div>
            <Hamster size={150} mood={mood} animated sparkles={claimable > 0n} className="mx-auto" title={t.brand.mascot} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label={a.deposited} value={`$ ${fmt(totalUsd, 6, 2)}`} hint={a.depositedHint} />
            <Stat label={a.claimable} value={`${fmtSats(claimable)} sats`} accent hint={`≈ ${fmt(claimable, 8, 8)} cbBTC`} />
            <Stat label={a.pending} value={`≈ ${fmtSats(pendingSats)} sats`} hint={feeBps ? a.pendingHint(feeBps / 100) : undefined} />
          </div>
        </section>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_400px]">
          <section>
            <h2 className="font-display text-xl font-extrabold">{a.vaultsTitle}</h2>
            <div className="mt-3 space-y-3">
              {live.vaults.map((lv) => {
                const info = VAULTS.find((v) => v.id === lv.id)!;
                const text = t.vaults[lv.id];
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
                        <span className="font-display font-extrabold">{text.name}</span>
                        {st.paused && <span className="rounded-full bg-blush/40 px-2 text-[10px] font-bold">{a.paused}</span>}
                      </div>
                      <div className="text-xs text-muted">
                        {lv.symbol} → {a.yieldIn} cbBTC · {text.source}
                        {market.isLive && <span className="font-bold text-good"> · {apyText(lv.id)}</span>}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                        <div className="h-full bg-btc" style={{ width: `${Math.min(fill, 100)}%` }} />
                      </div>
                      <div className="num mt-1 text-[10px] text-muted">
                        {fmt(st.totalSupply, lv.decimals, 2)} / {fmt(st.depositCap, lv.decimals, 2)} {lv.symbol} {a.betaLimit}
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
              <div className="card flex items-center gap-4 p-4 opacity-80">
                <Hamster size={56} mood="wink" title="" />
                <div className="flex-1">
                  <div className="font-display font-extrabold">{t.vaults.btc.name}</div>
                  <div className="text-xs text-muted">{a.fullHamsterDesc}</div>
                  <div className="mt-1 text-xs font-semibold text-btc-ink">{t.landing.btcSoon}</div>
                </div>
                <span className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-bold text-muted">{a.soon}</span>
              </div>
              {live.deployment.turboVault && <TurboTeaser />}
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
  const { t } = useT();
  const a = t.app;
  const { fmt, fmtSats } = formatters(t.numberLocale);
  const info = t.vaults[vault.id];
  const { open: openConnect } = useConnectModal();
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ text: string; hash: Hash } | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const endCelebration = useCallback(() => setCelebrate(null), []);
  const write = useAttributedWrite();
  const fees = useEstimateFeesPerGas({ query: { enabled: vault.native, refetchInterval: 30_000 } });

  let value = 0n;
  try {
    value = amount ? parseUnits(amount.replace(",", "."), vault.decimals) : 0n;
  } catch {
    value = 0n;
  }
  // Native ETH: keep a little back for gas, otherwise "Max" leaves nothing to pay the deposit with.
  const spendable = vault.native ? spendableEth(state.walletBalance, fees.data?.maxFeePerGas) : state.walletBalance;
  const limit = mode === "deposit" ? (spendable < state.maxDeposit ? spendable : state.maxDeposit) : state.deposited;
  const tooMuch = Boolean(user) && value > limit;
  const needsGas = tooMuch && mode === "deposit" && vault.native && value <= state.walletBalance && value <= state.maxDeposit;
  const canSubmit = !disabled && !busy && value > 0n && !tooMuch;

  /** Shows `label` on the button while the transaction is signed and mined. */
  async function send(label: string, tx: () => Promise<Hash>) {
    setBusy(label);
    const hash = await tx();
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async function submit() {
    if (!user) return;
    setError(null);
    setDone(null);
    try {
      const v = { address: vault.address, abi: btcYieldVaultAbi } as const;
      if (mode === "deposit") {
        if (vault.native) {
          const hash = await send(a.busy.deposit, () => write.mutateAsync({ ...v, functionName: "depositETH", args: [user], value }));
          setDone({ text: a.done.deposit, hash });
        } else {
          if (state.allowance < value) {
            await send(a.busy.approve, () =>
              write.mutateAsync({
                address: vault.asset,
                abi: erc20Abi,
                functionName: "approve",
                args: [vault.address, value],
              }),
            );
          }
          const hash = await send(a.busy.deposit, () => write.mutateAsync({ ...v, functionName: "deposit", args: [value, user] }));
          setDone({ text: a.done.deposit, hash });
        }
        onReact(a.reactDeposit(amount, vault.symbol), "happy");
        setCelebrate(a.celebrate(amount, vault.symbol));
      } else {
        const hash = await send(a.busy.withdraw, () =>
          write.mutateAsync({
            ...v,
            functionName: vault.native ? "withdrawETH" : "withdraw",
            args: [value, user, user],
          }),
        );
        setDone({ text: a.done.withdraw, hash });
        onReact(a.reactWithdraw, "wink");
      }
      setAmount("");
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
      refetchSoon(state.refetch);
    }
  }

  async function claim() {
    if (!user) return;
    setError(null);
    setDone(null);
    try {
      const hash = await send(a.busy.claim, () =>
        write.mutateAsync({ address: vault.address, abi: btcYieldVaultAbi, functionName: "claim", args: [user] }),
      );
      setDone({ text: a.done.claim, hash });
      onReact(a.reactClaim, "happy");
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
      refetchSoon(state.refetch);
    }
  }

  return (
    <section className="card self-start p-5">
      <h2 className="font-display text-xl font-extrabold">{info.name}</h2>
      <p className="mt-1 text-sm text-muted">{info.summary}</p>

      <div className="mt-5 rounded-2xl bg-surface-2 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-muted">{a.claimable}</div>
            <div className="num font-display text-2xl font-extrabold text-btc-ink">{fmtSats(state.claimableSats)} sats</div>
            {state.pendingSatsEstimate > 0n && (
              <div className="num text-xs text-muted">
                {a.pendingSats(fmtSats(state.pendingSatsEstimate))}
              </div>
            )}
          </div>
          <button className="btn btn-primary !px-4 !py-2 text-sm" disabled={disabled || !!busy || state.claimableSats === 0n} onClick={claim}>
            {a.claim}
          </button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 rounded-full border border-line p-1 text-sm font-bold" role="tablist">
        {(["deposit", "withdraw"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            className={`rounded-full py-2 ${mode !== m ? "text-muted" : m === "deposit" ? "bg-good text-white" : "bg-btc text-[#2a1406]"}`}
            onClick={() => {
              setMode(m);
              setAmount("");
              setError(null);
            }}
          >
            {m === "deposit" ? a.depositTab : a.withdrawTab}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-baseline justify-between text-xs font-bold text-muted">
        <label htmlFor="amount">{a.amount}</label>
        <button className="num underline" onClick={() => setAmount(formatUnits(limit, vault.decimals))} disabled={limit === 0n}>
          {mode === "deposit" ? a.max : a.all}: {fmt(limit, vault.decimals)} {vault.symbol}
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
          {needsGas ? a.keepGas : mode === "deposit" ? a.tooMuchDeposit : a.tooMuchWithdraw}
        </p>
      )}

      <div className="mt-4 space-y-1 rounded-2xl bg-surface-2 p-4 text-sm">
        <div className="flex justify-between">
          <span className="text-muted">{a.inWallet}</span>
          <span className="num">
            {fmt(state.walletBalance, vault.decimals)} {vault.symbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{a.deposited}</span>
          <span className="num">
            {fmt(state.deposited, vault.decimals)} {vault.symbol}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">{a.fee}</span>
          <span>{a.feeValue(state.performanceFeeBps / 100)}</span>
        </div>
      </div>

      {user && mode === "deposit" && state.walletBalance === 0n && <FundingHint address={user} symbol={vault.symbol} />}

      {celebrate && <Celebration text={celebrate} onDone={endCelebration} />}

      <button
        className={`btn mt-5 w-full ${mode === "deposit" ? "btn-go" : "btn-primary"}`}
        disabled={user ? !canSubmit : false}
        onClick={user ? submit : openConnect}
      >
        {busy ??
          (!user
            ? t.connect.login
            : disabled
              ? a.wrongNetwork
              : value === 0n
              ? a.enterAmount
              : mode === "deposit"
                ? a.depositCta(amount, vault.symbol)
                : a.withdrawCta(amount, vault.symbol))}
      </button>
      {busy && <p className="mt-2 text-xs text-muted">{a.txPending}</p>}
      {done && (
        <div className="mt-3 rounded-2xl bg-good/15 px-4 py-3 text-sm">
          <span className="font-bold text-good">✓ {done.text}</span> <span className="text-muted">{a.doneHint}</span>{" "}
          <a href={txUrl(done.hash)} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline">
            {a.viewTx} ↗
          </a>
        </div>
      )}
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
