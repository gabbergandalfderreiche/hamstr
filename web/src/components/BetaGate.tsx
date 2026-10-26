"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Hamster } from "./Hamster";
import { BRAND } from "@/lib/brand";
import { LEGAL } from "@/lib/legal";

const STORAGE_KEY = `hamstr-beta-accepted-${LEGAL.betaNoticeVersion}`;

const POINTS = [
  {
    id: "beta",
    text: "Ich verstehe, dass Hamstr Beta-Software ist und die Smart Contracts noch nicht extern auditiert sind.",
  },
  {
    id: "loss",
    text: "Mir ist bewusst, dass ich eingezahlte Mittel teilweise oder ganz verlieren kann, und ich zahle nur ein, was ich verkraften kann.",
  },
  {
    id: "advice",
    text: "Hamstr gibt keine Anlage-, Rechts- oder Steuerberatung. Angezeigte Renditen sind variabel und nicht garantiert.",
  },
  {
    id: "eligible",
    text: "Ich bin volljährig, und die Nutzung ist in meinem Land erlaubt. Für Steuern bin ich selbst verantwortlich.",
  },
];

// Acceptance lives in localStorage; if storage is blocked (private mode etc.) it only lasts for this page.
const listeners = new Set<() => void>();
let acceptedThisSession = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readAccepted() {
  if (acceptedThisSession) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    return false;
  }
}

function storeAccepted() {
  acceptedThisSession = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "yes");
  } catch {
    // Not persisted; the notice shows again next visit.
  }
  listeners.forEach((l) => l());
}

/** Blocks the app until the visitor has confirmed every point of the beta notice once. */
export function BetaGate({ children }: { children: ReactNode }) {
  // null on the server: the dialog only decides after mount, so it never flashes for returning users.
  const accepted = useSyncExternalStore<boolean | null>(subscribe, readAccepted, () => null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const firstBox = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (accepted === false) firstBox.current?.focus();
  }, [accepted]);

  const allChecked = POINTS.every((p) => checked[p.id]);
  const accept = storeAccepted;

  const blocked = accepted !== true;

  return (
    <>
      <div inert={blocked} aria-hidden={blocked} className="flex min-h-full flex-1 flex-col">
        {children}
      </div>

      {accepted === false && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="beta-title"
            className="card max-h-[90vh] w-full max-w-lg overflow-y-auto p-6"
          >
            <div className="flex items-center gap-3">
              <Hamster size={64} mood="sparkle" coin={false} title="" />
              <div>
                <span className="rounded-full bg-blush/40 px-2 py-0.5 text-[11px] font-bold">Beta</span>
                <h2 id="beta-title" className="font-display mt-1 text-2xl font-extrabold">
                  Kurz bevor du loslegst
                </h2>
              </div>
            </div>
            <p className="mt-3 text-sm text-muted">
              {BRAND.name} ist neu. Damit wir beide wissen, worauf du dich einlässt, bestätige bitte jeden Punkt:
            </p>

            <ul className="mt-4 space-y-3">
              {POINTS.map((p, i) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-3 text-sm hover:border-btc">
                    <input
                      ref={i === 0 ? firstBox : undefined}
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--btc)]"
                      checked={Boolean(checked[p.id])}
                      onChange={(e) => setChecked((c) => ({ ...c, [p.id]: e.target.checked }))}
                    />
                    <span>{p.text}</span>
                  </label>
                </li>
              ))}
            </ul>

            <button className="btn btn-primary mt-5 w-full" disabled={!allChecked} onClick={accept}>
              {allChecked ? "Verstanden, weiter zur App" : "Bitte alle Punkte bestätigen"}
            </button>
            <div className="mt-3 flex justify-between text-xs font-semibold text-muted">
              <Link href="/" className="underline">
                Zurück zur Startseite
              </Link>
              <span className="flex gap-3">
                <Link href="/impressum" className="underline">
                  Impressum
                </Link>
                <Link href="/datenschutz" className="underline">
                  Datenschutz
                </Link>
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
