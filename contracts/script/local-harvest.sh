#!/usr/bin/env bash
# Local fork only: jumps time forward so Aave accrues interest, then harvests both vaults the way
# the keeper bot would.
#
# A fork receives no new Chainlink updates, so after a time jump the swapper would (correctly)
# reject the prices as stale. On the fork only, each feed's code is swapped for LocalFreshFeed,
# which keeps returning the last real price with a current timestamp.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8545}
HOURS=${HOURS:-12}
KEEPER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil #0 (local keeper)
DEPLOYMENT=deployments/31337.json
FEEDS="0x7e860098F58bBFC8648a4311b374B1D669a2bc6B 0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70 0x07DA0E54543a844a80ABE69c8A12F22B3aA59f9D"

if [ "$(cast chain-id --rpc-url "$RPC")" != "31337" ]; then
  echo "Refusing to run: not the local fork (chain id 31337)." >&2
  exit 1
fi

FRESH_FEED_CODE=$(forge inspect LocalFreshFeed deployedBytecode)
for feed in $FEEDS; do
  if ! cast call --rpc-url "$RPC" "$feed" "isLocalFreshFeed()(bool)" >/dev/null 2>&1; then
    answer=$(cast call --rpc-url "$RPC" "$feed" "latestRoundData()(uint80,int256,uint256,uint256,uint80)" | sed -n 2p | awk '{print $1}')
    decimals=$(cast call --rpc-url "$RPC" "$feed" "decimals()(uint8)")
    cast rpc --rpc-url "$RPC" anvil_setCode "$feed" "$FRESH_FEED_CODE" >/dev/null
    cast rpc --rpc-url "$RPC" anvil_setStorageAt "$feed" 0x0 "$(cast to-uint256 "$answer")" >/dev/null
    cast rpc --rpc-url "$RPC" anvil_setStorageAt "$feed" 0x1 "$(cast to-uint256 "$decimals")" >/dev/null
    echo "==> Feed $feed frozen at its last real price ($answer)"
  fi
done

cast rpc --rpc-url "$RPC" evm_increaseTime $((HOURS * 3600)) >/dev/null
cast rpc --rpc-url "$RPC" evm_mine >/dev/null
echo "==> Advanced $HOURS hours"

# SKIP_HARVEST=1: only move time forward, e.g. to test the keeper (keeper/src/keeper.mjs).
if [ "${SKIP_HARVEST:-}" = "1" ]; then exit 0; fi

for key in usdcVault ethVault; do
  vault=$(grep -o "\"$key\": *\"0x[0-9a-fA-F]*\"" $DEPLOYMENT | grep -o "0x[0-9a-fA-F]*")
  pending=$(cast call --rpc-url "$RPC" "$vault" "unrealizedYield()(uint256)")
  echo "==> $key: unrealized yield $pending"
  if cast send --rpc-url "$RPC" --private-key $KEEPER_PK "$vault" "harvest(uint256)" 0 >/dev/null 2>&1; then
    echo "    harvested"
  else
    echo "    skipped (below minimum harvest or nothing to do)"
  fi
done
