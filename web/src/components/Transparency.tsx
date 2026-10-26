"use client";

import { deployments } from "@/generated/contracts";
import { useT } from "@/i18n/client";

// Always the Base mainnet contracts, also when the app itself runs against a local fork.
const MAINNET = (deployments as unknown as Record<string, Record<string, string> | undefined>)["8453"];
const REPO = "https://github.com/gabbergandalfderreiche/hamstr";
const LINKS: Record<string, string> = {
  github: REPO,
  security: `${REPO}/blob/main/SECURITY.md`,
  sourcify: MAINNET ? `https://repo.sourcify.dev/8453/${MAINNET.usdcVault}` : "https://sourcify.dev",
};

/** Protocols Hamstr integrates. Plain names and links only – no logos, no implied partnership. */
const BUILT_ON = [
  { id: "aave", name: "Aave V3", url: "https://aave.com" },
  { id: "uniswap", name: "Uniswap V3", url: "https://uniswap.org" },
  { id: "chainlink", name: "Chainlink", url: "https://chain.link" },
  { id: "cbbtc", name: "cbBTC (Coinbase)", url: "https://www.coinbase.com/cbbtc" },
  { id: "base", name: "Base", url: "https://base.org" },
] as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Verifiable facts instead of promises: security status, contract links, integrated protocols. */
export function Transparency() {
  const { t } = useT();
  const x = t.landing.transparency;
  const d = MAINNET;
  const contracts = d
    ? (["usdcVault", "ethVault", "turboVault", "timelock"] as const)
        .filter((key) => d[key])
        .map((key) => ({ key, label: x.contracts[key], address: d[key] }))
    : [];

  return (
    <div className="mt-8 grid gap-4 lg:grid-cols-3">
      <div className="card p-6">
        <h3 className="font-display text-lg font-extrabold">{x.statusTitle}</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {x.status.map((s) => (
            <li key={s.text} className="flex gap-2">
              <span className={s.ok ? "text-good" : "text-muted"} aria-hidden>
                {s.ok ? "✓" : "○"}
              </span>
              <span className={s.ok ? "" : "text-muted"}>
                {s.text}
                {s.link && (
                  <>
                    {" "}
                    <a href={LINKS[s.link]} target="_blank" rel="noopener noreferrer" className="text-xs underline">
                      {x.details} ↗
                    </a>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="font-display text-lg font-extrabold">{x.contractsTitle}</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {contracts.map((c) => (
            <li key={c.key}>
              <div className="font-semibold">{c.label}</div>
              <div className="num flex flex-wrap gap-x-3 text-xs text-muted">
                <span>{short(c.address)}</span>
                <a href={`https://basescan.org/address/${c.address}`} target="_blank" rel="noopener noreferrer" className="underline">
                  Basescan ↗
                </a>
                <a href={`https://repo.sourcify.dev/8453/${c.address}`} target="_blank" rel="noopener noreferrer" className="underline">
                  Sourcify ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-6">
        <h3 className="font-display text-lg font-extrabold">{x.builtOnTitle}</h3>
        <ul className="mt-3 space-y-2.5 text-sm">
          {BUILT_ON.map((p) => (
            <li key={p.id}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                {p.name} ↗
              </a>
              <div className="text-xs text-muted">{x.builtOn[p.id]}</div>
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">{x.independent}</p>
      </div>
    </div>
  );
}
