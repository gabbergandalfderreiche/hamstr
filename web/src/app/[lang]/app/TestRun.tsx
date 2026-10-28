"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { erc20Abi, formatUnits, type Address, type Hash } from "viem";
import { useBalance, useEstimateFeesPerGas, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { btcYieldVaultAbi } from "@/generated/contracts";
import { Hamster } from "@/components/Hamster";
import { useConnectModal } from "@/components/ConnectModal";
import { wagmiConfig } from "@/lib/wagmi";
import { gasReserve, refetchSoon, spendableEth, txUrl } from "@/lib/tx";
import type { Live, LiveVault } from "@/lib/live";
import { useT } from "@/i18n/client";
import type { VaultState } from "./useVaultState";

/** Test amounts: big enough to show up in the dashboard, small enough not to matter. */
const TEST_USDC = 1_000_000n; // 1 USDC
const TEST_ETH = 500_000_000_000_000n; // 0.0005 ETH

type Progress = { vault?: LiveVault["id"]; deposit?: Hash; withdraw?: Hash; hidden?: boolean };

// Progress per wallet in this browser: a convenience only, the chain stays the source of truth.
const storageKey = (user: Address | undefined) => `hamstr-testrun:${user?.toLowerCase() ?? "guest"}`;
const listeners = new Set<() => void>();

function readProgress(key: string): string {
  try {
    return localStorage.getItem(key) ?? "{}";
  } catch {
    return "{}";
  }
}

function writeProgress(key: string, p: Progress) {
  try {
    localStorage.setItem(key, JSON.stringify(p));
  } catch {
    // Storage blocked: the test run still works for this visit.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function errorText(e: unknown, cancelled: string, unknown: string) {
  const err = e as { shortMessage?: string; message?: string };
  const msg = err.shortMessage ?? err.message ?? unknown;
  return /rejected|denied/i.test(msg) ? cancelled : msg.split("\n")[0];
}

/**
 * Guided first run: deposit a tiny amount, see it in the dashboard, withdraw it again.
 * Newcomers trust the app once they have seen money go in and come back out.
 */
export function TestRun({
  live,
  states,
  user,
  disabled,
}: {
  live: Live;
  states: Record<LiveVault["id"], VaultState>;
  user: Address | undefined;
  disabled: boolean;
}) {
  const { t, path } = useT();
  const tr = t.testRun;
  const { open: openConnect } = useConnectModal();
  const write = useWriteContract();
  const key = storageKey(user);
  const raw = useSyncExternalStore(subscribe, () => readProgress(key), () => "{}");
  const progress = JSON.parse(raw) as Progress;
  const save = (p: Progress) => writeProgress(key, { ...progress, ...p });

  const ethBalance = useBalance({ address: user, query: { enabled: Boolean(user), refetchInterval: 4_000 } });
  const fees = useEstimateFeesPerGas({ query: { refetchInterval: 30_000 } });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (progress.hidden) return null;

  const ethWei = ethBalance.data?.value ?? 0n;
  const hasGas = ethWei >= gasReserve(fees.data?.maxFeePerGas);
  // Prefer the Dollar Hamster; fall back to ETH when the wallet only holds ETH. Once deposited, stick to that vault.
  const preferred: LiveVault["id"] =
    states.usdc.walletBalance >= TEST_USDC || spendableEth(ethWei, fees.data?.maxFeePerGas) < TEST_ETH ? "usdc" : "eth";
  const vault = live.vaults.find((v) => v.id === (progress.vault ?? preferred))!;
  const state = states[vault.id];
  const amount = vault.native ? TEST_ETH : TEST_USDC;
  const amountText = `${formatUnits(amount, vault.decimals)} ${vault.symbol}`;
  const funded = hasGas && (vault.native ? spendableEth(ethWei, fees.data?.maxFeePerGas) >= amount : state.walletBalance >= amount);

  const steps = [
    { done: Boolean(user), title: tr.steps.login },
    { done: Boolean(user) && (funded || Boolean(progress.deposit)), title: tr.steps.fund },
    { done: Boolean(progress.deposit), title: tr.steps.deposit(amountText) },
    { done: Boolean(progress.withdraw), title: tr.steps.withdraw(amountText) },
  ];
  const current = steps.findIndex((s) => !s.done);
  const finished = current === -1;

  async function send(label: string, tx: () => Promise<Hash>) {
    setBusy(label);
    const hash = await tx();
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async function deposit() {
    if (!user) return;
    setError(null);
    try {
      const v = { address: vault.address, abi: btcYieldVaultAbi } as const;
      let hash: Hash;
      if (vault.native) {
        hash = await send(tr.busy.deposit, () => write.mutateAsync({ ...v, functionName: "depositETH", args: [user], value: amount }));
      } else {
        if (state.allowance < amount) {
          await send(tr.busy.approve, () =>
            write.mutateAsync({ address: vault.asset, abi: erc20Abi, functionName: "approve", args: [vault.address, amount] }),
          );
        }
        hash = await send(tr.busy.deposit, () => write.mutateAsync({ ...v, functionName: "deposit", args: [amount, user] }));
      }
      save({ vault: vault.id, deposit: hash });
    } catch (e) {
      setError(errorText(e, t.app.cancelled, t.app.unknownError));
    } finally {
      setBusy(null);
      refetchSoon(state.refetch);
    }
  }

  async function withdraw() {
    if (!user) return;
    setError(null);
    try {
      // Shares are 1:1 with principal; never more than the wallet actually has in the vault.
      const shares = state.deposited < amount ? state.deposited : amount;
      const hash = await send(tr.busy.withdraw, () =>
        write.mutateAsync({
          address: vault.address,
          abi: btcYieldVaultAbi,
          functionName: vault.native ? "withdrawETH" : "withdraw",
          args: [shares, user, user],
        }),
      );
      save({ withdraw: hash });
    } catch (e) {
      setError(errorText(e, t.app.cancelled, t.app.unknownError));
    } finally {
      setBusy(null);
      refetchSoon(state.refetch);
    }
  }

  return (
    <section className="card card-highlight mb-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Hamster size={64} mood={finished ? "happy" : "wink"} sparkles={finished} title="" />
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-btc-ink">{tr.kicker}</div>
            <h2 className="font-display text-xl font-extrabold md:text-2xl">{finished ? tr.doneTitle : tr.title(amountText)}</h2>
            <p className="mt-1 max-w-xl text-sm text-muted">{finished ? tr.doneText : tr.sub}</p>
          </div>
        </div>
        <button onClick={() => save({ hidden: true })} className="text-xs font-semibold text-muted underline">
          {finished ? tr.hide : tr.skip}
        </button>
      </div>

      <ol className="mt-5 grid gap-2 sm:grid-cols-4">
        {steps.map((s, i) => (
          <li
            key={s.title}
            className={`flex items-center gap-2 rounded-2xl p-3 text-sm ${
              s.done ? "bg-good/15" : i === current ? "bg-btc/15 ring-2 ring-btc" : "bg-surface-2 text-muted"
            }`}
          >
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-extrabold ${
                s.done ? "bg-good text-white" : "bg-surface text-ink"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span className="font-semibold">{s.title}</span>
          </li>
        ))}
      </ol>

      {!finished && (
        <div className="mt-4">
          {current === 0 && (
            <button onClick={openConnect} className="btn btn-primary">
              {t.connect.login}
            </button>
          )}
          {current === 1 && (
            <p className="text-sm">
              {hasGas ? tr.needFunds(amountText) : tr.needGas}{" "}
              <Link href={path("/start")} className="font-semibold underline">
                {tr.guide}
              </Link>
            </p>
          )}
          {current === 2 && (
            <>
              <button onClick={deposit} disabled={disabled || Boolean(busy)} className="btn btn-primary">
                {busy ?? tr.depositCta(amountText)}
              </button>
              <p className="mt-2 text-xs text-muted">{vault.native ? tr.depositHintEth : tr.depositHintUsdc}</p>
            </>
          )}
          {current === 3 && (
            <>
              <p className="text-sm">
                <span className="font-bold text-good">✓ {tr.depositedNow(amountText)}</span>{" "}
                <a href={txUrl(progress.deposit!)} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                  {t.app.viewTx} ↗
                </a>
              </p>
              <button onClick={withdraw} disabled={disabled || Boolean(busy) || state.deposited === 0n} className="btn btn-primary mt-3">
                {busy ?? tr.withdrawCta(amountText)}
              </button>
              <p className="mt-2 text-xs text-muted">{tr.withdrawHint}</p>
            </>
          )}
          {busy && <p className="mt-2 text-xs text-muted">{t.app.txPending}</p>}
          {error && <p className="mt-2 text-xs font-semibold text-red-600">{error}</p>}
        </div>
      )}

      {finished && progress.withdraw && (
        <p className="mt-4 text-sm">
          <a href={txUrl(progress.withdraw)} target="_blank" rel="noopener noreferrer" className="text-xs underline">
            {tr.withdrawTx} ↗
          </a>
        </p>
      )}
    </section>
  );
}
