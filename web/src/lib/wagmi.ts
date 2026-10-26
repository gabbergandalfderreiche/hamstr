import { createConfig, http } from "wagmi";
import { baseAccount } from "wagmi/connectors/baseAccount";
import { injected } from "wagmi/connectors/injected";
import { mock } from "wagmi/connectors/mock";
import { BRAND } from "./brand";
import { base } from "wagmi/chains";
import { activeChain, baseFork, FORK_TEST_WALLET, NETWORK } from "./network";

export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors:
    NETWORK === "fork"
      ? [
          // Sends transactions through the local anvil node, which has this account unlocked.
          mock({ accounts: [FORK_TEST_WALLET], features: { reconnect: true } }),
          injected(),
        ]
      : [
          // Passkey smart wallet: sign in with Face ID / fingerprint, no seed phrase, no extension.
          baseAccount({ appName: BRAND.name }),
          // For people who already use MetaMask, Rabby & co.
          injected(),
        ],
  transports: {
    [base.id]: http(),
    [baseFork.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
