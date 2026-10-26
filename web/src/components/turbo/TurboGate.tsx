"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/i18n/client";

const STORAGE_KEY = "hamstr-turbo-unlocked-v1";
const listeners = new Set<() => void>();
let unlockedThisSession = false;

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readUnlocked() {
  if (unlockedThisSession) return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "yes";
  } catch {
    return false;
  }
}

function storeUnlocked() {
  unlockedThisSession = true;
  try {
    window.localStorage.setItem(STORAGE_KEY, "yes");
  } catch {
    // Only for this page view then.
  }
  listeners.forEach((l) => l());
}

/** Shows the Turbo dashboard only after both quiz questions are answered right and the risk is confirmed. */
export function TurboGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const q = t.turbo.quiz;
  const unlocked = useSyncExternalStore<boolean | null>(subscribe, readUnlocked, () => null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [tried, setTried] = useState(false);

  if (unlocked === null) return null;
  if (unlocked) return <>{children}</>;

  const allRight = q.questions.every((question, i) => answers[i] === question.correct);

  return (
    <div className="card border-red-400/60 p-6">
      <h3 className="font-display text-2xl font-extrabold">{q.title}</h3>
      <div className="mt-4 space-y-5">
        {q.questions.map((question, i) => (
          <fieldset key={question.q}>
            <legend className="font-bold">{question.q}</legend>
            <div className="mt-2 space-y-2">
              {question.options.map((option, j) => {
                const chosen = answers[i] === j;
                const wrong = tried && chosen && j !== question.correct;
                return (
                  <label
                    key={option}
                    className={`flex cursor-pointer gap-3 rounded-2xl border p-3 text-sm ${
                      wrong ? "border-red-500 bg-red-500/10" : chosen ? "border-btc" : "border-line hover:border-btc"
                    }`}
                  >
                    <input
                      type="radio"
                      name={`turbo-q${i}`}
                      checked={chosen}
                      onChange={() => setAnswers((a) => ({ ...a, [i]: j }))}
                      className="mt-0.5 accent-[var(--btc)]"
                    />
                    <span>{option}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <label className="mt-5 flex cursor-pointer gap-3 rounded-2xl border border-line p-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-red-500"
        />
        <span className="font-semibold">{q.confirm}</span>
      </label>

      {tried && !allRight && <p className="mt-3 text-sm font-semibold text-red-600">{q.wrong}</p>}

      <button
        className="btn mt-5 w-full bg-red-500 text-white shadow-[0_4px_0_#b91c1c]"
        disabled={!confirmed || Object.keys(answers).length < q.questions.length}
        onClick={() => {
          setTried(true);
          if (allRight && confirmed) storeUnlocked();
        }}
      >
        {q.unlock}
      </button>
    </div>
  );
}
