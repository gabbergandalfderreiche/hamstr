"use client";

import Link from "next/link";
import { Hamster } from "@/components/Hamster";
import { useT } from "@/i18n/client";

/** Small, clearly marked entry point to the high-risk Turbo vault. */
export function TurboTeaser() {
  const { t, path } = useT();
  const tb = t.turbo;
  return (
    <Link
      href={path("/turbo")}
      className="card flex items-center gap-4 border-red-400/60 p-4 transition hover:border-red-500"
    >
      <Hamster size={56} mood="wink" title="" />
      <div className="flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-extrabold">{tb.title}</span>
          <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold text-white">{tb.badge}</span>
        </div>
        <p className="mt-1 text-xs text-muted">{tb.cardText}</p>
      </div>
      <span className="text-sm font-bold text-red-600">{tb.cardCta} →</span>
    </Link>
  );
}
