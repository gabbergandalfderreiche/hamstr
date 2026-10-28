"use client";

import { useCallback, useState } from "react";
import { formatEther, parseEther, zeroAddress, type Address, type Hash } from "viem";
import { useBalance, useConnection, useEstimateFeesPerGas, useReadContracts, useSimulateContract } from "wagmi";
import { useAttributedWrite } from "@/lib/attribution";
import { waitForTransactionReceipt } from "wagmi/actions";
import { refetchSoon, spendableEth, txUrl } from "@/lib/tx";
import { Hamster } from "@/components/Hamster";
import { Celebration } from "@/components/Celebration";
import { oracleSwapperAbi, turboVaultAbi } from "@/generated/contracts";
import { wagmiConfig } from "@/lib/wagmi";
import type { Live } from "@/lib/live";
import { useT } from "@/i18n/client";
import { useConnectModal } from "@/components/ConnectModal";

const REFRESH_MS = 5_000;
/** Withdrawals revert if they return less than this share of the shown value. */
const MIN_OUT_BPS = 9_850n;

/** ETH amount for the input field, at most 6 decimals. */
function trimEth(x: bigint) {
  const [whole, fraction = ""] = formatEther(x).split(".");
  const short = fraction.slice(0, 6).replace(/0+$/, "");
  return short ? `${whole}.${short}` : whole;
}

type Mode = "deposit" | "withdraw";

export function TurboDashboard({ live, vault }: { live: Live; vault: Address }) {
  const { t } = useT();
  const d = t.turbo.dash;
  const a = t.app;
  const { address, isConnected } = useConnection();
  const { open: openConnect } = useConnectModal();
  const who = address ?? zeroAddress;
  const v = { address: vault, abi: turboVaultAbi } as const;

  const reads = useReadContracts({
    contracts: [
      { ...v, functionName: "totalAssets" },
      { ...v, functionName: "depositCap" },
      { ...v, functionName: "balanceOf", args: [who] },
      { ...v, functionName: "principalOf", args: [who] },
      { ...v, functionName: "claimable", args: [who] },
      { ...v, functionName: "inRange" },
      { ...v, functionName: "positionId" },
      { ...v, functionName: "maxDeposit", args: [who] },
      { ...v, functionName: "paused" },
    ],
    query: { refetchInterval: REFRESH_MS },
  });
  const r = reads.data;
  const total = (r?.[0]?.result as bigint | undefined) ?? 0n;
  const cap = (r?.[1]?.result as bigint | undefined) ?? 0n;
  const shares = (r?.[2]?.result as bigint | undefined) ?? 0n;
  const principal = (r?.[3]?.result as bigint | undefined) ?? 0n;
  const owed = r?.[4]?.result as readonly [bigint, bigint] | undefined;
  const inRange = (r?.[5]?.result as boolean | undefined) ?? false;
  const positionId = (r?.[6]?.result as bigint | undefined) ?? 0n;
  const maxDeposit = (r?.[7]?.result as bigint | undefined) ?? 0n;

  // Value of the user's shares and their fees in sats (WETH part converted at the Chainlink price).
  const extra = useReadContracts({
    contracts: [
      { ...v, functionName: "convertToAssets", args: [shares] },
      {
        address: live.deployment.swapper,
        abi: oracleSwapperAbi,
        functionName: "quote",
        args: [live.deployment.weth, live.deployment.cbbtc, owed?.[0] ?? 0n],
      },
    ],
    query: { refetchInterval: REFRESH_MS },
  });
  const myValue = (extra.data?.[0]?.result as bigint | undefined) ?? 0n;
  const collectedSats = (owed?.[1] ?? 0n) + ((extra.data?.[1]?.result as bigint | undefined) ?? 0n);

  // The view above only knows fees already pulled out of Uniswap. Simulating claim() also collects
  // the fresh ones and swaps them, so it shows exactly what a claim would pay right now.
  const claimPreview = useSimulateContract({
    ...v,
    functionName: "claim",
    args: [who, true],
    account: address,
    query: { enabled: Boolean(address) && shares > 0n, refetchInterval: REFRESH_MS },
  });
  const feeSats = claimPreview.data?.result?.[0] ?? collectedSats;

  const ethBalance = useBalance({ address, query: { enabled: Boolean(address), refetchInterval: REFRESH_MS } });
  const wallet = ethBalance.data?.value ?? 0n;

  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  // "All" on withdraw burns every share, even though the field shows a rounded amount.
  const [useAll, setUseAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const endCelebration = useCallback(() => setCelebrate(null), []);
  const [done, setDone] = useState<{ text: string; hash: Hash } | null>(null);
  const write = useAttributedWrite();
  const fees = useEstimateFeesPerGas({ query: { refetchInterval: 30_000 } });

  const eth = (x: bigint, digits = 4) =>
    Number(formatEther(x)).toLocaleString(t.numberLocale, { maximumFractionDigits: digits });
  const result = myValue - principal;

  let value = 0n;
  try {
    value = amount ? parseEther(amount.replace(",", ".")) : 0n;
  } catch {
    value = 0n;
  }
  // Keep a little ETH back for gas, otherwise "Max" leaves nothing to pay the deposit with.
  const spendable = spendableEth(wallet, fees.data?.maxFeePerGas);
  const limit = mode === "deposit" ? (spendable < maxDeposit ? spendable : maxDeposit) : myValue;
  const tooMuch = isConnected && !useAll && value > limit;
  const needsGas = tooMuch && mode === "deposit" && value <= wallet && value <= maxDeposit;
  const canSubmit = isConnected && !busy && value > 0n && !tooMuch;

  async function send(label: string, tx: () => Promise<Hash>) {
    setBusy(label);
    const hash = await tx();
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }

  async function run(label: string, doneText: string, tx: () => Promise<Hash>, onSuccess?: () => void) {
    setError(null);
    setDone(null);
    try {
      const hash = await send(label, tx);
      setDone({ text: doneText, hash });
      onSuccess?.();
      setAmount("");
      setUseAll(false);
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      const msg = err.shortMessage ?? err.message ?? a.unknownError;
      setError(/rejected|denied/i.test(msg) ? a.cancelled : msg.split("\n")[0]);
    } finally {
      setBusy(null);
      refetchSoon(() => {
        reads.refetch();
        extra.refetch();
        claimPreview.refetch();
        ethBalance.refetch();
      });
    }
  }

  function submit() {
    if (!address) return;
    if (mode === "deposit") {
      const text = a.celebrate(amount, "ETH");
      run(
        a.busy.deposit,
        a.done.deposit,
        () => write.mutateAsync({ ...v, functionName: "depositETH", args: [address], value }),
        () => setCelebrate(text),
      );
      return;
    }
    // Withdraw by ETH value: the matching share of the user's shares (all of them for the max).
    const all = useAll || value >= myValue;
    const burn = all ? shares : (shares * value) / myValue;
    const minOut = ((all ? myValue : value) * MIN_OUT_BPS) / 10_000n;
    run(a.busy.withdraw, a.done.withdraw, () =>
      write.mutateAsync({ ...v, functionName: "withdrawETH", args: [burn, address, address, minOut] }),
    );
  }

  function claim() {
    if (!address) return;
    run(a.busy.claim, a.done.claim, () => write.mutateAsync({ ...v, functionName: "claim", args: [address, true] }));
  }

  const status = positionId === 0n ? d.noPosition : inRange ? d.inRange : d.outOfRange;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <section className="card border-red-400/60 p-6">
        <div className="flex items-center gap-4">
          <Hamster size={80} mood={inRange ? "happy" : "wink"} coin title="" />
          <div>
            <div className="text-xs font-semibold text-muted">{d.status}</div>
            <div className={`font-bold ${inRange ? "text-good" : "text-red-600"}`}>{status}</div>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Stat label={d.yourValue} value={`${eth(myValue)} ETH`} />
          <Stat label={d.deposited} value={`${eth(principal)} ETH`} />
          <Stat
            label={d.result}
            value={`${result >= 0n ? "+" : "−"}${eth(result >= 0n ? result : -result, 5)} ETH`}
            tone={result >= 0n ? "good" : "bad"}
          />
          <Stat label={d.fees} value={`${Number(feeSats).toLocaleString(t.numberLocale)} sats`} tone="btc" />
        </div>
        <div className="num mt-6 text-xs text-muted">
          {d.vaultSize}: {eth(total)} / {eth(cap)} ETH {a.betaLimit}
        </div>
      </section>

      <section className="card self-start p-5">
        <button
          className="btn btn-primary w-full"
          disabled={!isConnected || !!busy || feeSats === 0n}
          onClick={claim}
        >
          {busy === a.busy.claim ? busy : `${d.claimBtc} (${Number(feeSats).toLocaleString(t.numberLocale)} sats)`}
        </button>

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
                setUseAll(false);
                setError(null);
              }}
            >
              {m === "deposit" ? a.depositTab : a.withdrawTab}
            </button>
          ))}
        </div>

        <div className="mt-4 flex items-baseline justify-between text-xs font-bold text-muted">
          <label htmlFor="turbo-amount">{a.amount}</label>
          <button
            className="num underline"
            onClick={() => {
              setAmount(trimEth(limit));
              setUseAll(mode === "withdraw");
            }}
            disabled={limit === 0n}
          >
            {mode === "deposit" ? a.max : a.all}: {eth(limit)} ETH
          </button>
        </div>
        <div className="mt-1 flex items-center rounded-2xl border-[1.5px] border-line bg-bg px-4 focus-within:border-btc">
          <input
            id="turbo-amount"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setUseAll(false);
            }}
            className="num w-full bg-transparent py-3 text-2xl font-bold outline-none"
          />
          <span className="font-bold text-muted">ETH</span>
        </div>
        {tooMuch && (
          <p className="mt-2 text-xs font-semibold text-red-600">
            {needsGas ? a.keepGas : mode === "deposit" ? a.tooMuchDeposit : a.tooMuchWithdraw}
          </p>
        )}
        {mode === "withdraw" && (
          <p className="mt-3 rounded-2xl bg-red-500/10 px-3 py-2 text-xs font-bold text-red-600">{d.withdrawWarn}</p>
        )}

        {celebrate && <Celebration text={celebrate} onDone={endCelebration} />}

        <button
          className={`btn mt-5 w-full ${mode === "deposit" ? "btn-go" : "btn-primary"}`}
          disabled={isConnected ? !canSubmit : false}
          onClick={isConnected ? submit : openConnect}
        >
          {busy && busy !== a.busy.claim
            ? busy
            : !isConnected
              ? t.connect.login
              : value === 0n
                ? a.enterAmount
                : mode === "deposit"
                  ? a.depositCta(amount, "ETH")
                  : a.withdrawCta(amount, "ETH")}
        </button>
        {mode === "withdraw" && <p className="mt-2 text-[11px] text-muted">{d.slippage}</p>}
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
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "btc" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-red-600" : tone === "btc" ? "text-btc-ink" : "";
  return (
    <div className="rounded-2xl bg-surface-2 p-4">
      <div className="text-xs font-semibold text-muted">{label}</div>
      <div className={`num font-display mt-1 text-2xl font-extrabold ${color}`}>{value}</div>
    </div>
  );
}
