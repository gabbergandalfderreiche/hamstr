"use client";

import { useState } from "react";
import Link from "next/link";
import type { Address } from "viem";
import { useT } from "@/i18n/client";

/** Shown next to the deposit form while the wallet is empty: the address to send to, plus a link to the guide. */
export function FundingHint({ address, symbol }: { address: Address; symbol: string }) {
  const { t, path } = useT();
  const g = t.guide;
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the address is selectable text anyway.
    }
  }

  return (
    <div className="mt-4 rounded-2xl border-2 border-dashed border-btc/60 p-4 text-sm">
      <p className="text-muted">{g.noFunds(symbol)}</p>
      <div className="mt-2 flex items-center gap-2">
        <code className="num min-w-0 flex-1 select-all break-all rounded-lg bg-surface-2 px-2 py-1.5 text-xs">{address}</code>
        <button onClick={copy} className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-xs">
          {copied ? g.copied : g.screens.copy}
        </button>
      </div>
      <Link href={path("/start")} className="mt-3 inline-block text-xs font-semibold underline">
        {g.howTo}
      </Link>
    </div>
  );
}
