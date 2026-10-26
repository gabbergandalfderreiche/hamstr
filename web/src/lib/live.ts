import type { Address } from "viem";
import { deployments } from "@/generated/contracts";

type Deployment = {
  chainId: number;
  usdcVault: Address;
  ethVault: Address;
  swapper: Address;
  usdc: Address;
  weth: Address;
  cbbtc: Address;
  timelock: Address;
};

export type LiveVault = {
  /** Matches the id in VAULTS (display texts, mascot mood). */
  id: "usdc" | "eth";
  address: Address;
  asset: Address;
  decimals: number;
  symbol: string;
  /** Deposits/withdrawals in native ETH. */
  native: boolean;
};

export type Live = {
  deployment: Deployment;
  vaults: LiveVault[];
};

/** Contracts deployed on `chainId`, or null if there is no deployment (the app then runs as a demo). */
export function getLive(chainId: number): Live | null {
  const d = (deployments as unknown as Record<string, Deployment>)[String(chainId)];
  if (!d) return null;
  return {
    deployment: d,
    vaults: [
      { id: "usdc", address: d.usdcVault, asset: d.usdc, decimals: 6, symbol: "USDC", native: false },
      { id: "eth", address: d.ethVault, asset: d.weth, decimals: 18, symbol: "ETH", native: true },
    ],
  };
}
