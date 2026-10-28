import { createConfig, http } from "wagmi";
import { baseAccount } from "wagmi/connectors/baseAccount";
import { injected } from "wagmi/connectors/injected";
import { mock } from "wagmi/connectors/mock";
import { walletConnect } from "wagmi/connectors/walletConnect";
import { BRAND } from "./brand";
import { base } from "wagmi/chains";
import { activeChain, baseFork, FORK_TEST_WALLET, NETWORK } from "./network";

/** Free project ID from dashboard.reown.com; without it the desktop QR login is simply not offered. */
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WC_PROJECT_ID;

// Desktop users scan a QR code with a phone wallet and stay signed in on the desktop.
// showQrModal: false – the sign-in dialog draws the QR code itself from the "display_uri" message.
const phoneWallet = WC_PROJECT_ID
  ? [
      walletConnect({
        projectId: WC_PROJECT_ID,
        showQrModal: false,
        metadata: {
          name: BRAND.name,
          description: "Park dollars, the interest turns into Bitcoin.",
          url: "https://www.hamstr.online",
          icons: ["https://www.hamstr.online/hamstr-icon-dark.png"],
        },
      }),
    ]
  : [];

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
          ...phoneWallet,
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
