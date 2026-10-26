/**
 * Impermanent loss of a concentrated Uniswap V3 position, the same math the Turbo vault uses.
 *
 * Start: price 1 (BTC per ETH, normalized), range ±halfWidthTicks around it. `movePct` is how much
 * ETH changes against BTC. Values are per 1 ETH deposited, measured in ETH, before trading fees.
 * Checked against the fork test: ETH −15 % → Turbo 1.020, half/half held 1.088.
 */
export function simulateTurbo(movePct: number, halfWidthTicks = 800) {
  const k = 1.0001 ** halfWidthTicks;
  const sa = 1 / Math.sqrt(k);
  const sb = Math.sqrt(k);

  const amounts = (sp: number) => {
    if (sp <= sa) return { eth: 1 / sa - 1 / sb, btc: 0 };
    if (sp >= sb) return { eth: 0, btc: sb - sa };
    return { eth: 1 / sp - 1 / sb, btc: sp - sa };
  };

  const start = amounts(1);
  const startValue = start.eth + start.btc;
  const price = 1 + movePct / 100;
  const now = amounts(Math.sqrt(price));

  const turbo = (now.eth + now.btc / price) / startValue;
  const fiftyFifty = (start.eth + start.btc / price) / startValue;
  return { turbo, fiftyFifty, keepEth: 1, impermanentLoss: 1 - turbo / fiftyFifty };
}
