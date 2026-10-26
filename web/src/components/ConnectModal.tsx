"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { useConnect, useConnection, useConnectors, type Connector } from "wagmi";
import { Hamster } from "./Hamster";
import { useT } from "@/i18n/client";

const PHANTOM_DOWNLOAD = "https://phantom.com/download";

const ConnectModalContext = createContext<{ open: () => void }>({ open: () => {} });

/** Any component can open the sign-in dialog, e.g. a "Sign in" button next to a deposit form. */
export function useConnectModal() {
  return useContext(ConnectModalContext);
}

/** Wallets the browser announced itself (EIP-6963), e.g. Phantom or MetaMask; their id is the wallet's rdns. */
const isDetected = (c: Connector) => c.type === "injected" && c.id !== "injected";
const isPhantom = (c: Connector) => c.id === "app.phantom" || /phantom/i.test(c.name);

/** Opens this site inside the Phantom app's browser, where Phantom is connected automatically. */
function phantomBrowseLink(url: string) {
  return `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(new URL(url).origin)}`;
}

export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      {isOpen && <ConnectDialog onClose={close} />}
    </ConnectModalContext.Provider>
  );
}

function ConnectDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const c = t.connect;
  const connectors = useConnectors();
  const connect = useConnect();
  const { isConnected } = useConnection();
  const dialog = useRef<HTMLDivElement>(null);
  const [qr, setQr] = useState<string | null>(null);

  // Browser-only facts, read once when the dialog opens.
  const [env] = useState(() => {
    if (typeof window === "undefined") return { hasExtension: false, mobile: false, url: "" };
    const w = window as unknown as { ethereum?: unknown };
    return {
      hasExtension: Boolean(w.ethereum),
      mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      url: window.location.href,
    };
  });

  const detected = connectors.filter(isDetected);
  const hasPhantom = detected.some(isPhantom);
  // The generic entry only helps when a wallet is injected but did not announce itself by name.
  const shown = connectors.filter((x) => (x.id === "injected" ? env.hasExtension && detected.length === 0 : true));
  const phantomLink = env.url ? phantomBrowseLink(env.url) : "";

  useEffect(() => {
    if (isConnected) onClose();
  }, [isConnected, onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    dialog.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (hasPhantom || env.mobile || !phantomLink) return;
    QRCode.toDataURL(phantomLink, { margin: 1, width: 200 }).then(setQr, () => setQr(null));
  }, [hasPhantom, env.mobile, phantomLink]);

  function labelFor(x: Connector) {
    if (isDetected(x)) return { title: x.name, hint: isPhantom(x) ? c.phantomHint : c.detected };
    return c.connectors[x.type] ?? { title: x.name, hint: "" };
  }

  const errorText = connect.error
    ? /provider not found/i.test(connect.error.message)
      ? c.noWallet
      : /rejected|denied/i.test(connect.error.message)
        ? t.app.cancelled
        : connect.error.message.split("\n")[0]
    : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-title"
        tabIndex={-1}
        className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-5 outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <Hamster size={48} mood="happy" coin={false} title="" />
            <div>
              <h2 id="connect-title" className="font-display text-xl font-extrabold">
                {c.modalTitle}
              </h2>
              <p className="text-xs text-muted">{c.modalSub}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label={c.close} className="rounded-full px-2 text-xl text-muted hover:text-ink">
            ×
          </button>
        </div>

        <div className="mt-4 space-y-1">
          {shown.map((x) => {
            const label = labelFor(x);
            return (
              <button
                key={x.uid}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2"
                onClick={() => connect.mutate({ connector: x })}
              >
                {x.icon ? (
                  // Wallet-provided data-URI logo; next/image adds nothing for these.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={x.icon} alt="" className="h-8 w-8 shrink-0 rounded-lg" />
                ) : (
                  <span className="h-8 w-8 shrink-0" aria-hidden />
                )}
                <span className="flex flex-col">
                  <span className="font-bold">{label.title}</span>
                  {label.hint && <span className="text-xs text-muted">{label.hint}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {!hasPhantom && (
          <div className="mt-4 rounded-2xl bg-surface-2 p-4">
            <div className="font-bold">{c.phantomMobile.title}</div>
            {env.mobile ? (
              <>
                <a href={phantomLink} className="btn mt-3 w-full bg-[#ab9ff2] text-white">
                  {c.phantomMobile.open}
                </a>
                <p className="mt-2 text-xs text-muted">{c.phantomMobile.openHint}</p>
              </>
            ) : (
              <div className="mt-3 flex items-center gap-4">
                {qr && (
                  // QR code generated locally as a data URL.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt="QR code" width={120} height={120} className="rounded-lg bg-white p-1" />
                )}
                <p className="text-xs leading-relaxed text-muted">{c.phantomMobile.qrHint}</p>
              </div>
            )}
            {!env.mobile && (
              <a
                href={PHANTOM_DOWNLOAD}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-xs font-semibold underline"
              >
                {c.installPhantom.title} ↗
              </a>
            )}
          </div>
        )}

        {errorText && <p className="mt-3 text-xs font-semibold text-red-600">{errorText}</p>}
      </div>
    </div>
  );
}
