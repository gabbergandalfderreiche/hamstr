"use client";

import { useEffect, type CSSProperties } from "react";

const PIECES = 42;
const DURATION_MS = 2600;

/** Scattered-looking but fixed values in [0, 1), so rendering stays pure. */
const noise = (n: number) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const pieces = Array.from({ length: PIECES }, (_, i) => ({
  kind: i % 3 === 0 ? "spark" : "coin",
  x: Math.round((noise(i + 1) - 0.5) * 90), // vw
  y: Math.round(35 + noise(i + 101) * 45), // vh, how high it flies
  spin: Math.round((noise(i + 201) - 0.5) * 720),
  delay: Math.round(noise(i + 301) * 250),
  size: Math.round(18 + noise(i + 401) * 18),
}));

/**
 * Full-screen burst of coins and sparkles with a big headline, shown once after a deposit lands.
 * Purely decorative: ignores clicks and disappears on its own. Respects reduced-motion settings.
 */
export function Celebration({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const id = setTimeout(onDone, DURATION_MS);
    return () => clearTimeout(id);
  }, [onDone]);


  return (
    <div className="celebrate pointer-events-none fixed inset-0 z-[60] overflow-hidden" role="status" aria-live="polite">
      <div className="celebrate-flash absolute inset-0" />
      {pieces.map((p, i) => (
        <span
          key={i}
          aria-hidden
          className={`celebrate-piece ${p.kind === "coin" ? "celebrate-coin" : "celebrate-spark"}`}
          style={
            {
              "--x": `${p.x}vw`,
              "--y": `-${p.y}vh`,
              "--spin": `${p.spin}deg`,
              animationDelay: `${p.delay}ms`,
              width: p.size,
              height: p.size,
              fontSize: p.size * 0.6,
            } as CSSProperties
          }
        >
          {p.kind === "coin" ? "₿" : ""}
        </span>
      ))}
      <div className="absolute inset-0 flex items-center justify-center p-6">
        <div className="celebrate-text rounded-3xl bg-good px-6 py-4 text-center font-display text-2xl font-extrabold text-white shadow-[0_6px_0_#157244] sm:text-4xl">
          {text}
        </div>
      </div>
    </div>
  );
}
