/** External tools we point users to. Leave `url` empty to hide an entry. */
export const TAX_TOOL = {
  name: "Crypto-Café Tax",
  url: "https://cryptocafetax.de",
};

/** P2P Bet (testnet, play money): football bets and the Löwensprung crash game. Own app on its own subdomain. */
export const BET_APP = {
  url: process.env.NEXT_PUBLIC_BET_URL || "https://bet.hamstr.online",
};
