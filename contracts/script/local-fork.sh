#!/usr/bin/env bash
# Local test setup: deploys Hamstr onto a running anvil fork of Base and funds a test wallet.
#
#   1. anvil --fork-url https://mainnet.base.org --chain-id 31337
#   2. bash script/local-fork.sh
#   3. (in web/) npm run sync-contracts && NEXT_PUBLIC_NETWORK=fork npm run dev
#
# Uses anvil's public test keys. NEVER use these addresses or keys on a real network: on Base
# mainnet they carry EIP-7702 "sweeper" delegations that steal incoming ETH. On the fork we wipe
# that code below.
set -euo pipefail
cd "$(dirname "$0")/.."

RPC=${RPC:-http://127.0.0.1:8545}
DEPLOYER_PK=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 # anvil #0
DEPLOYER=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
TEST_USER=0x70997970C51812dc3A010C7d01b50e0d17dc79C8 # anvil #1, used by the frontend's test wallet
TREASURY=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC # anvil #2

USDC=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
A_USDC=0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB # holds Aave's USDC, used as a faucet
HUNDRED_ETH=0x56BC75E2D63100000

echo "==> Removing sweeper delegations copied from mainnet and funding with ETH"
for a in $DEPLOYER $TEST_USER $TREASURY; do
  cast rpc --rpc-url "$RPC" anvil_setCode "$a" 0x >/dev/null
  cast rpc --rpc-url "$RPC" anvil_setBalance "$a" $HUNDRED_ETH >/dev/null
done

echo "==> Deploying (deployer acts as multisig and keeper locally, 60s timelock)"
# Low harvest minimums so a few hours of interest on test amounts can be harvested.
MULTISIG=$DEPLOYER KEEPER=$DEPLOYER TREASURY=$TREASURY TIMELOCK_DELAY=60 \
  USDC_MIN_HARVEST=100000 ETH_MIN_HARVEST=10000000000000 \
  forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --private-key $DEPLOYER_PK

echo "==> Deploying the Turbo vault (high risk) on top"
forge script script/DeployTurbo.s.sol --rpc-url "$RPC" --broadcast --private-key $DEPLOYER_PK

echo "==> Sending 20,000 USDC to the test wallet"
cast rpc --rpc-url "$RPC" anvil_impersonateAccount $A_USDC >/dev/null
cast rpc --rpc-url "$RPC" anvil_setBalance $A_USDC $HUNDRED_ETH >/dev/null
cast send --rpc-url "$RPC" --unlocked --from $A_USDC $USDC "transfer(address,uint256)" $TEST_USER 20000000000 >/dev/null
cast rpc --rpc-url "$RPC" anvil_stopImpersonatingAccount $A_USDC >/dev/null

echo "Done. Test wallet: $TEST_USER"
