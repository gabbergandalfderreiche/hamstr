"use client";

import { useEffect, useState } from "react";
import { useConnection } from "wagmi";

/**
 * The chain the connected wallet is really on. Some wallets (Phantom) do not always report a
 * network switch made inside the wallet, so wagmi can keep showing the old chain, e.g. a testnet
 * used for another app. We ask the wallet again on focus, when the tab becomes visible and every
 * few seconds.
 */
export function useWalletChain() {
  const { chainId, connector, isConnected } = useConnection();
  const [actual, setActual] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!connector || !isConnected) return;
    let alive = true;
    const check = () => {
      connector
        .getChainId()
        .then((id) => alive && setActual(id))
        .catch(() => {
          // Wallet busy or locked: keep what wagmi reports.
        });
    };
    check();
    const timer = setInterval(check, 5_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [connector, isConnected, chainId]);

  return isConnected ? (actual ?? chainId) : undefined;
}
