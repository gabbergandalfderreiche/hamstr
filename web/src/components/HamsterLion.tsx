"use client";

import { useEffect, useRef, useState } from "react";
import { HamsterPet } from "@/components/Hamster";
import { useT } from "@/i18n/client";
import { BET_APP } from "@/lib/partners";

const MORPH_MS = 2100;

/**
 * The hero hamster. A single click is still the turn-and-wiggle easter egg; a double click plays the
 * drawn hamster-to-lion frames and jumps to Löwensprung on P2P Bet.
 */
export function HamsterLion({ label }: { label: string }) {
  const { locale } = useT();
  const [morphing, setMorphing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const leap = () => {
    if (morphing) return;
    const target = `${BET_APP.url}/${locale}/lion-den`;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // P2P Bet is its own app on its own domain, so this is a real page load, not a Next.js route.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(target);
      return;
    }
    setMorphing(true);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    timer.current = setTimeout(() => window.location.assign(target), MORPH_MS);
  };

  return (
    <div className="relative h-full w-full" onDoubleClick={leap}>
      <div className={`h-full w-full ${morphing ? "morph-out" : ""}`}>
        <HamsterPet size={288} sparkles animated className="h-full w-full [&>svg]:h-full [&>svg]:w-full" label={label} />
      </div>
      {morphing && (
        <>
          <div className="morph-frames pointer-events-none absolute -bottom-[6%] left-1/2 w-[150%] -translate-x-1/2" aria-hidden />
          <div className="morph-burst pointer-events-none absolute inset-0 rounded-full" aria-hidden />
        </>
      )}
    </div>
  );
}
