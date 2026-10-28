const MIN_GAS_RESERVE = 100_000_000_000_000n; // 0.0001 ETH
const DEPOSIT_GAS = 500_000n; // generous upper bound for depositETH incl. the Turbo vault

/**
 * ETH kept back when depositing "Max" of native ETH, so the deposit itself can still pay gas.
 * Wallets check balance >= value + gas × maxFeePerGas, so the reserve follows the current max fee
 * (3× headroom for fee spikes and the L1 data fee), with a floor for when no estimate is loaded yet.
 */
export function gasReserve(maxFeePerGas: bigint | undefined) {
  const estimate = maxFeePerGas ? DEPOSIT_GAS * maxFeePerGas * 3n : 0n;
  return estimate > MIN_GAS_RESERVE ? estimate : MIN_GAS_RESERVE;
}

/** Spendable part of a native ETH balance after the gas reserve. */
export function spendableEth(balance: bigint, maxFeePerGas: bigint | undefined) {
  const reserve = gasReserve(maxFeePerGas);
  return balance > reserve ? balance - reserve : 0n;
}

/**
 * Refetch now and twice more shortly after: public RPC nodes can lag a few seconds behind the
 * block that confirmed the transaction, which made a fresh deposit look missing until a reload.
 */
export function refetchSoon(refetch: () => void) {
  refetch();
  setTimeout(refetch, 3_000);
  setTimeout(refetch, 8_000);
}

export const txUrl = (hash: string) => `https://basescan.org/tx/${hash}`;
