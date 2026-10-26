"use client";

import { useState } from "react";
import { useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { useT } from "@/i18n/client";

function short(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

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

  return (
    <div className="relative">
      <button className="btn btn-primary !py-2 text-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {t.connect.login}
      </button>
      {open && (
        <div className="card absolute right-0 z-30 mt-2 w-72 p-2">
          {connectors.map((c) => {
            const label = t.connect.connectors[c.type] ?? { title: c.name, hint: "" };
            return (
              <button
                key={c.uid}
                className="flex w-full flex-col items-start rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => {
                  connect.mutate({ connector: c });
                  setOpen(false);
                }}
              >
                <span className="font-bold">{label.title}</span>
                {label.hint && <span className="text-xs text-muted">{label.hint}</span>}
              </button>
            );
          })}
          {connect.error && <p className="px-3 py-2 text-xs text-red-600">{connect.error.message}</p>}
        </div>
      )}
    </div>
  );
}
