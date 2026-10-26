import { defineChain } from "viem";
import { base } from "wagmi/chains";

/** "fork" = local anvil fork of Base (test money), anything else = Base mainnet. */
export const NETWORK = process.env.NEXT_PUBLIC_NETWORK === "fork" ? "fork" : "base";

export const baseFork = defineChain({
  id: 31337,
  name: "Base (lokaler Fork)",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_FORK_RPC ?? "http://127.0.0.1:8545"] } },
  testnet: true,
});

export const activeChain = NETWORK === "fork" ? baseFork : base;

/** anvil account #1, funded by contracts/script/local-fork.sh. Local fork only. */
export const FORK_TEST_WALLET = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as const;
