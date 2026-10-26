"use client";

import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect, type Connector } from "wagmi";
import { useT } from "@/i18n/client";

const PHANTOM_DOWNLOAD = "https://phantom.com/download";

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Wallets the browser announced itself (EIP-6963), e.g. Phantom or MetaMask; their id is the wallet's rdns. */
const isDetected = (c: Connector) => c.type === "injected" && c.id !== "injected";
const isPhantom = (c: Connector) => c.id === "app.phantom" || /phantom/i.test(c.name);

export function ConnectButton() {
  const { t } = useT();
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const connect = useConnect();
  const disconnect = useDisconnect();
  const [open, setOpen] = useState(false);

  if (isConnected && address) {
    return (
      <button className="btn btn-ghost !py-2 text-sm" onClick={() => disconnect.mutate()} title={t.connect.logout}>
        <span className="h-2 w-2 rounded-full bg-good" />
        <span className="num">{short(address)}</span>
      </button>
    );
  }

  const detected = connectors.filter(isDetected);
  // The generic "browser wallet" entry is only useful when no wallet announced itself by name.
  const shown = connectors.filter((c) => (c.id === "injected" ? detected.length === 0 : true));
  const hasPhantom = detected.some(isPhantom);

  function labelFor(c: Connector) {
    if (isDetected(c)) return { title: c.name, hint: isPhantom(c) ? t.connect.phantomHint : t.connect.detected };
    return t.connect.connectors[c.type] ?? { title: c.name, hint: "" };
  }

  return (
    <div className="relative">
      <button className="btn btn-primary !py-2 text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {t.connect.login}
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-72 p-2">
          {shown.map((c) => {
            const label = labelFor(c);
            return (
              <button
                key={c.uid}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  connect.mutate({ connector: c });
                  setOpen(false);
                }}
              >
                {c.icon ? (
                  // Wallet-provided data-URI logo; next/image adds nothing for these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.icon} alt="" className="h-7 w-7 shrink-0 rounded-lg" />
                ) : (
                  <span className="h-7 w-7 shrink-0" aria-hidden />
                )}
                <span className="flex flex-col">
                  <span className="font-bold">{label.title}</span>
                  {label.hint && <span className="text-xs text-muted">{label.hint}</span>}
                </span>
              </button>
            );
          })}
          {!hasPhantom && (
            <a
              href={PHANTOM_DOWNLOAD}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#ab9ff2] text-sm font-extrabold text-white">
                P
              </span>
              <span className="flex flex-col">
                <span className="font-bold">{t.connect.installPhantom.title} ↗</span>
                <span className="text-xs text-muted">{t.connect.installPhantom.hint}</span>
              </span>
            </a>
          )}
          {connect.error && <p className="px-3 py-2 text-xs text-red-600">{connect.error.message}</p>}
        </div>
      )}
    </div>
  );
}
