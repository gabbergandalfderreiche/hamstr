"use client";

import { deployments } from "@/generated/contracts";
import { useT } from "@/i18n/client";

// Always the Base mainnet contracts, also when the app itself runs against a local fork.
const MAINNET = (
  deployments as unknown as Record<string, Record<string, string> | undefined>
)["8453"];
const REPO = "https://github.com/gabbergandalfderreiche/hamstr";
const SLITHER = "https://github.com/crytic/slither";
const LINKS: Record<string, string> = {
  github: REPO,
  security: `${REPO}/blob/main/SECURITY.md`,
  basescan: MAINNET
    ? `https://basescan.org/address/${MAINNET.usdcVault}#code`
    : "https://basescan.org",
};

const MAIN_CONTRACTS = [
  "usdcVault",
  "ethVault",
  "turboVault",
  "timelock",
] as const;
const HELPER_CONTRACTS = [
  "usdcStrategy",
  "ethStrategy",
  "swapper",
  "turboSwapper",
] as const;
type ContractKey =
  (typeof MAIN_CONTRACTS)[number] | (typeof HELPER_CONTRACTS)[number];

/** Protocols Hamstr integrates. Plain names and links only – no logos, no implied partnership. */
const BUILT_ON = [
  { id: "aave", name: "Aave V3", url: "https://aave.com" },
  { id: "uniswap", name: "Uniswap V3", url: "https://uniswap.org" },
  { id: "chainlink", name: "Chainlink", url: "https://chain.link" },
  {
    id: "cbbtc",
    name: "cbBTC (Coinbase)",
    url: "https://www.coinbase.com/cbbtc",
  },
  { id: "base", name: "Base", url: "https://base.org" },
] as const;

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Verifiable facts instead of promises: security status, contract links, integrated protocols. */
export function Transparency() {
  const { t } = useT();
  const x = t.landing.transparency;
  const d = MAINNET;
  const pick = (keys: readonly ContractKey[]) =>
    d
      ? keys
          .filter((key) => d[key])
          .map((key) => ({ key, label: x.contracts[key], address: d[key] }))
      : [];
  const renderContract = (c: {
    key: string;
    label: string;
    address: string;
  }) => (
    <li key={c.key}>
      <div className="font-semibold">{c.label}</div>
      <div className="num flex flex-wrap gap-x-3 text-xs text-muted">
        <span>{short(c.address)}</span>
        <a
          href={`https://basescan.org/address/${c.address}#code`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Basescan ↗
        </a>
        <a
          href={`https://repo.sourcify.dev/8453/${c.address}`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          Sourcify ↗
        </a>
      </div>
    </li>
  );

  const r = x.report;

  return (
    <>
      <div className="card card-highlight mt-8 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-xs font-bold uppercase tracking-widest text-btc-ink">
              {r.kicker}
            </div>
            <h3 className="mt-1 font-display text-2xl font-extrabold md:text-3xl">
              {r.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{r.sub}</p>
          </div>
          <a
            href={SLITHER}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3 hover:border-btc"
          >
            <span
              className="grid h-10 w-10 place-items-center rounded-full bg-btc text-lg font-extrabold text-white"
              aria-hidden
            >
              ✓
            </span>
            <span className="leading-tight">
              <span className="block font-display font-extrabold">
                {r.slitherBadge} ↗
              </span>
              <span className="block text-xs text-muted">{r.slitherBy}</span>
            </span>
          </a>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {r.stats.map((s) => (
            <div key={s.label} className="rounded-2xl bg-surface-2 p-4">
              <dt className="num whitespace-nowrap font-display text-2xl font-extrabold text-good md:text-3xl">
                {s.value}
              </dt>
              <dd className="mt-1 text-xs leading-snug text-muted">
                {s.label}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p className="text-muted">
            {r.runs} {r.slitherNote}
          </p>
          <a
            href={LINKS.security}
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold underline"
          >
            {r.report} ↗
          </a>
        </div>
        <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
          {r.fine}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="card p-6">
          <h3 className="font-display text-lg font-extrabold">
            {x.statusTitle}
          </h3>
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
                      <a
                        href={LINKS[s.link]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline"
                      >
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
          <h3 className="font-display text-lg font-extrabold">
            {x.contractsTitle}
          </h3>
          <ul className="mt-3 space-y-3 text-sm">
            {pick(MAIN_CONTRACTS).map(renderContract)}
          </ul>
          <details className="mt-4 border-t border-line pt-3">
            <summary className="cursor-pointer text-xs font-semibold text-muted">
              {x.contractsMore} (4)
            </summary>
            <ul className="mt-3 space-y-3 text-sm">
              {pick(HELPER_CONTRACTS).map(renderContract)}
            </ul>
          </details>
        </div>

        <div className="card p-6">
          <h3 className="font-display text-lg font-extrabold">
            {x.builtOnTitle}
          </h3>
          <ul className="mt-3 space-y-2.5 text-sm">
            {BUILT_ON.map((p) => (
              <li key={p.id}>
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline"
                >
                  {p.name} ↗
                </a>
                <div className="text-xs text-muted">{x.builtOn[p.id]}</div>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-muted">
            {x.independent}
          </p>
        </div>
      </div>
    </>
  );
}
