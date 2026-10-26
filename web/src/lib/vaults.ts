import type { Dictionary } from "@/i18n";

export type Risk = "niedrig" | "mittel";
export type VaultId = "usdc" | "eth" | "btc";

/** Vault facts; the texts (name, summary, source, risk note) are in the dictionaries under `vaults`. */
export type Vault = {
  id: VaultId;
  deposit: string;
  /** What the yield is paid out in. */
  payout: string;
  risk: Risk;
  /** Demo value until contracts are live. */
  apy: number;
  mood: "sparkle" | "happy" | "wink";
};

export const VAULTS: Vault[] = [
  { id: "usdc", deposit: "USDC", payout: "cbBTC", risk: "niedrig", apy: 5.2, mood: "sparkle" },
  { id: "eth", deposit: "ETH", payout: "cbBTC", risk: "niedrig", apy: 1.4, mood: "happy" },
  { id: "btc", deposit: "cbBTC", payout: "cbBTC", risk: "niedrig", apy: 0.6, mood: "wink" },
];

export function vaultText(t: Dictionary, id: VaultId) {
  return t.vaults[id];
}

/** Demo BTC price for estimates only. */
export const DEMO_BTC_USD = 100_000;
export const DEMO_ETH_USD = 3_500;

export function usdValue(asset: string, amount: number) {
  if (asset === "ETH") return amount * DEMO_ETH_USD;
  if (asset === "cbBTC") return amount * DEMO_BTC_USD;
  return amount;
}

/** Sats per month earned on `amount` of `asset`, after a 10% performance fee. */
export function satsPerMonth(vault: Vault, amount: number, perfFee = 0.1) {
  const yearlyUsd = usdValue(vault.deposit, amount) * (vault.apy / 100) * (1 - perfFee);
  return Math.round((yearlyUsd / 12 / DEMO_BTC_USD) * 1e8);
}
