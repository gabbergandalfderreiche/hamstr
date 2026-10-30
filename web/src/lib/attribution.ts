import { Attribution } from "ox/erc8021";
import { useConnection, useSwitchChain, useWriteContract } from "wagmi";
import { activeChain } from "./network";

/**
 * Base Builder Code (from dashboard.base.org → Settings → Project Settings). Base uses it to
 * attribute our transactions to Hamstr, which is a requirement for its builder grants.
 * Without the env var transactions are sent exactly as before.
 */
const BUILDER_CODE = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE;

/** ERC-8021 suffix appended to the calldata; the contracts ignore trailing bytes. */
export const DATA_SUFFIX = BUILDER_CODE ? Attribution.toDataSuffix({ codes: [BUILDER_CODE] }) : undefined;

/**
 * useWriteContract that tags every transaction with the Builder Code and always sends on Base.
 * Wallets like Phantom can sit on Ethereum mainnet; without the chain pin the transaction would be
 * proposed there, where our contracts do not exist. So: switch to Base first, then write.
 */
export function useAttributedWrite() {
  const write = useWriteContract();
  const { chainId } = useConnection();
  const switchChain = useSwitchChain();
  const mutateAsync = (async (args: Parameters<typeof write.mutateAsync>[0]) => {
    if (chainId !== activeChain.id) await switchChain.mutateAsync({ chainId: activeChain.id });
    return write.mutateAsync({ ...args, chainId: activeChain.id, dataSuffix: DATA_SUFFIX });
  }) as typeof write.mutateAsync;
  return { ...write, mutateAsync };
}
