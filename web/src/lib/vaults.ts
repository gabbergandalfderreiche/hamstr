export type Risk = "niedrig" | "mittel";

export type Vault = {
  id: string;
  name: string;
  deposit: string;
  /** What the yield is paid out in. */
  payout: string;
  source: string;
  summary: string;
  risk: Risk;
  riskNote: string;
  /** Demo value until contracts are live. */
  apy: number;
  mood: "sparkle" | "happy" | "wink";
};

export const VAULTS: Vault[] = [
  {
    id: "usdc",
    name: "Dollar-Hamster",
    deposit: "USDC",
    payout: "cbBTC",
    source: "Aave Lending",
    summary: "Deine Dollar bleiben Dollar. Nur die Zinsen werden zu Bitcoin.",
    risk: "niedrig",
    riskNote: "Kein Kursrisiko aufs Kapital. Smart-Contract-Risiko bei Aave und Hamstr.",
    apy: 5.2,
    mood: "sparkle",
  },
  {
    id: "eth",
    name: "ETH-Hamster",
    deposit: "ETH",
    payout: "cbBTC",
    source: "Aave Lending",
    summary: "Dein ETH bleibt ETH. Nur die Zinsen werden zu Bitcoin.",
    risk: "niedrig",
    riskNote: "ETH-Kursrisiko bleibt. Smart-Contract-Risiko bei Aave und Hamstr.",
    apy: 1.4,
    mood: "happy",
  },
  {
    id: "btc",
    name: "Voll-Hamster",
    deposit: "cbBTC",
    payout: "cbBTC",
    source: "Aave Lending",
    summary: "Für Überzeugte: Bitcoin rein, mehr Bitcoin raus.",
    risk: "niedrig",
    riskNote: "Volles BTC-Kursrisiko. Bitcoin-Zinsen sind niedrig.",
    apy: 0.6,
    mood: "wink",
  },
];

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
