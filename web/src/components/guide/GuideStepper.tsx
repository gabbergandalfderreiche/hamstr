"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/i18n/client";
import { Hamster } from "../Hamster";

type Path = "phantom" | "exchange";
type Screen = "home" | "swapFrom" | "swapTo" | "swapGas" | "pending" | "hamstr" | "buy" | "address" | "withdraw";

const STEP_MS = 6000;
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Walks newcomers through funding a Base wallet: path picker, animated phone mock-up and step text. */
export function GuideStepper() {
  const { t } = useT();
  const g = t.guide;
  const [path, setPath] = useState<Path>("phantom");
  const [step, setStep] = useState(0);
  // null = no choice yet: autoplay unless the visitor asked the system to reduce motion.
  const [choice, setChoice] = useState<boolean | null>(null);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia(REDUCED_MOTION).matches, () => false);
  const playing = choice ?? !reducedMotion;
  const setPlaying = (p: boolean) => setChoice(p);
  const steps = g.steps[path];
  const current = steps[step];

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setStep((s) => (s + 1) % steps.length), STEP_MS);
    return () => clearTimeout(id);
  }, [playing, step, steps.length]);

  const go = (i: number) => {
    setStep((i + steps.length) % steps.length);
    setPlaying(false);
  };

  return (
    <div>
      <div role="tablist" aria-label={g.pathsLabel} className="flex flex-wrap gap-2">
        {(["phantom", "exchange"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={p === path}
            onClick={() => {
              setPath(p);
              setStep(0);
              setPlaying(true);
            }}
            className={`btn !py-2 text-sm ${p === path ? "btn-primary" : "btn-ghost"}`}
          >
            {g.paths[p]}
          </button>
        ))}
      </div>

      <div className="mt-6 grid items-center gap-8 md:grid-cols-[auto_1fr]">
        <Phone key={`${path}-${step}`} screen={current.screen as Screen} />

        <div>
          <div className="text-xs font-bold uppercase tracking-widest text-btc-ink">{g.controls.step(step + 1, steps.length)}</div>
          <h3 className="mt-1 font-display text-2xl font-extrabold">{current.title}</h3>
          <p className="mt-2 leading-relaxed text-muted">{current.text}</p>

          <ol className="mt-6 flex gap-1.5" aria-label={g.pathsLabel}>
            {steps.map((s, i) => (
              <li key={s.title} className="flex-1">
                <button
                  onClick={() => go(i)}
                  aria-label={`${g.controls.step(i + 1, steps.length)}: ${s.title}`}
                  aria-current={i === step ? "step" : undefined}
                  className="block h-1.5 w-full overflow-hidden rounded-full bg-line"
                >
                  <span
                    // Restarts with every step change, so the bar fills once per step.
                    key={`${path}-${step}-${playing}`}
                    className={`block h-full rounded-full bg-btc ${i < step ? "w-full" : i === step ? (playing ? "guide-progress" : "w-full") : "w-0"}`}
                    style={i === step && playing ? { animationDuration: `${STEP_MS}ms` } : undefined}
                  />
                </button>
              </li>
            ))}
          </ol>

          <div className="mt-4 flex gap-2">
            <button onClick={() => go(step - 1)} className="btn btn-ghost !py-2 text-sm">
              ← {g.controls.prev}
            </button>
            <button onClick={() => setPlaying(!playing)} className="btn btn-ghost !py-2 text-sm" aria-pressed={!playing}>
              {playing ? `❚❚ ${g.controls.pause}` : `▶ ${g.controls.play}`}
            </button>
            <button onClick={() => go(step + 1)} className="btn btn-primary !py-2 text-sm">
              {g.controls.next} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Generic phone mock-up. Deliberately not a copy of any real wallet's interface. */
function Phone({ screen }: { screen: Screen }) {
  const { t } = useT();
  const s = t.guide.screens;
  const isExchange = screen === "buy" || screen === "withdraw";
  const title = screen === "hamstr" || screen === "address" ? "Hamstr" : isExchange ? s.exchange : s.wallet;

  return (
    <div className="mx-auto w-60 rounded-[2.2rem] border-[6px] border-ink/80 bg-surface p-3 shadow-[0_8px_0_var(--line)]" aria-hidden>
      <div className="mx-auto mb-3 h-1.5 w-16 rounded-full bg-ink/20" />
      <div className="guide-screen flex h-[380px] flex-col rounded-2xl bg-surface-2 p-3 text-xs">
        <div className="mb-3 text-center font-display text-sm font-extrabold">{title}</div>
        {screen === "home" && <HomeScreen />}
        {(screen === "swapFrom" || screen === "swapTo" || screen === "swapGas") && <SwapScreen stage={screen} />}
        {screen === "pending" && <PendingScreen />}
        {screen === "hamstr" && <HamstrScreen />}
        {screen === "buy" && <BuyScreen />}
        {screen === "address" && <AddressScreen />}
        {screen === "withdraw" && <WithdrawScreen />}
      </div>
    </div>
  );
}

const Row = ({ children, glow }: { children: ReactNode; glow?: boolean }) => (
  <div className={`rounded-xl bg-surface p-3 ${glow ? "guide-glow" : ""}`}>{children}</div>
);

const Chip = ({ children, glow }: { children: ReactNode; glow?: boolean }) => (
  <span className={`rounded-full border border-line bg-surface-2 px-2 py-0.5 text-[10px] font-bold ${glow ? "guide-glow !border-btc text-btc-ink" : ""}`}>
    {children}
  </span>
);

function HomeScreen() {
  const s = useT().t.guide.screens;
  return (
    <>
      <div className="text-center text-muted">{s.balance}</div>
      <div className="num mt-1 text-center font-display text-3xl font-extrabold">$ 250</div>
      <div className="mt-1 text-center text-muted">1.6 SOL · Solana</div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[s.send, s.receive, s.swap].map((label) => (
          <div key={label} className={`rounded-xl bg-surface p-2 font-bold ${label === s.swap ? "guide-glow" : ""}`}>
            {label}
          </div>
        ))}
      </div>
      <Tap className="mt-3 self-end mr-6" />
    </>
  );
}

function SwapScreen({ stage }: { stage: "swapFrom" | "swapTo" | "swapGas" }) {
  const s = useT().t.guide.screens;
  const to = stage === "swapGas" ? { token: "ETH", amount: "≈ 0.0006" } : { token: "USDC", amount: "≈ 248" };
  return (
    <div className="space-y-2">
      <Row glow={stage === "swapFrom"}>
        <div className="text-muted">{s.youPay}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="num font-display text-lg font-extrabold">{stage === "swapGas" ? "0.013" : "1.6"}</span>
          <span className="font-bold">SOL</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-muted">
          {s.network}: <Chip>Solana</Chip>
        </div>
      </Row>
      <div className="text-center text-lg text-muted">↓</div>
      <Row glow={stage !== "swapFrom"}>
        <div className="text-muted">{s.youGet}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="num font-display text-lg font-extrabold">{to.amount}</span>
          <span className="font-bold">{to.token}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-muted">
          {s.network}: <Chip glow={stage !== "swapFrom"}>Base</Chip>
        </div>
      </Row>
      <div className="btn btn-primary mt-2 w-full !py-2 text-xs">{s.review}</div>
    </div>
  );
}

function PendingScreen() {
  const s = useT().t.guide.screens;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="guide-pending relative grid h-16 w-16 place-items-center">
        <span className="guide-spinner absolute inset-0 rounded-full border-4 border-line border-t-btc" />
        <span className="guide-check grid h-16 w-16 place-items-center rounded-full bg-good text-2xl font-extrabold text-white">✓</span>
      </div>
      <div className="guide-pending-text font-bold">
        <span className="guide-label-pending">{s.pending}</span>
        <span className="guide-label-done text-good">{s.arrived}</span>
      </div>
      <div className="text-muted">Solana → Base</div>
    </div>
  );
}

function HamstrScreen() {
  const s = useT().t.guide.screens;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto">
        <Hamster size={80} mood="happy" coin title="" />
      </div>
      <Row>
        <div className="text-muted">{s.amount}</div>
        <div className="mt-1 flex items-center justify-between">
          <span className="num font-display text-lg font-extrabold">248</span>
          <span className="font-bold">USDC</span>
        </div>
      </Row>
      <div className="btn btn-primary guide-glow mt-3 w-full !py-2 text-xs">{s.deposit}</div>
      <Tap className="mt-2 self-center" />
    </div>
  );
}

function BuyScreen() {
  const s = useT().t.guide.screens;
  return (
    <div className="space-y-2">
      {[
        { token: "USDC", amount: "250", glow: true },
        { token: "ETH", amount: "≈ 0.0006", glow: false },
      ].map((r) => (
        <Row key={r.token} glow={r.glow}>
          <div className="flex items-center justify-between">
            <span className="font-bold">{r.token}</span>
            <span className="num font-display text-lg font-extrabold">{r.amount}</span>
          </div>
        </Row>
      ))}
      <div className="btn btn-primary mt-2 w-full !py-2 text-xs">{s.buy}</div>
    </div>
  );
}

function AddressScreen() {
  const s = useT().t.guide.screens;
  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto">
        <Hamster size={70} mood="wink" coin={false} title="" />
      </div>
      <Row glow>
        <div className="text-muted">{s.yourAddress} · Base</div>
        <div className="num mt-1 break-all font-bold">0x12ab…9cDe</div>
        <div className="btn btn-ghost mt-2 w-full !py-1.5 text-xs">{s.copy}</div>
      </Row>
      <Tap className="mt-2 self-center" />
    </div>
  );
}

function WithdrawScreen() {
  const s = useT().t.guide.screens;
  return (
    <div className="space-y-2">
      <Row>
        <div className="text-muted">{s.address}</div>
        <div className="num mt-1 font-bold">0x12ab…9cDe</div>
      </Row>
      <Row glow>
        <div className="text-muted">{s.network}</div>
        <div className="mt-1 flex flex-wrap gap-1">
          <Chip>Ethereum</Chip>
          <Chip glow>Base</Chip>
          <Chip>Solana</Chip>
        </div>
      </Row>
      <Row>
        <div className="flex items-center justify-between">
          <span className="font-bold">USDC</span>
          <span className="num font-display text-lg font-extrabold">250</span>
        </div>
      </Row>
      <div className="btn btn-primary mt-1 w-full !py-2 text-xs">{s.withdraw}</div>
    </div>
  );
}

/** Animated fingertip that hints where to tap. */
function Tap({ className = "" }: { className?: string }) {
  return <span className={`guide-tap block h-6 w-6 rounded-full bg-btc/40 ring-4 ring-btc/30 ${className}`} />;
}
