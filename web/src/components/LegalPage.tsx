import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import { LegalFooter } from "./LegalFooter";
import { isPlaceholder } from "@/lib/legal";

/** Shared frame for Impressum and Datenschutz. */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-line bg-bg/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Link href="/app" className="btn btn-ghost !py-2 text-sm">
            Zur App
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="font-display text-4xl font-extrabold">{title}</h1>
        <div className="legal mt-6">{children}</div>
      </main>
      <LegalFooter />
    </div>
  );
}

/** Renders an operator detail; unfilled placeholders are highlighted. */
export function Field({ value }: { value: string }) {
  if (!isPlaceholder(value)) return <>{value}</>;
  return (
    <mark className="rounded bg-blush/50 px-1 text-ink" title="Platzhalter – bitte in src/lib/legal.ts ausfüllen">
      {value}
    </mark>
  );
}
