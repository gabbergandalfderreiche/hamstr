# hamstr

🇬🇧 English · 🇩🇪 [Deutsch](README.de.md)

DeFi BTC maxi aggregator: **Stack Bitcoin. Automatically.**

Users deposit USDC or ETH. The principal stays where it is – only the interest is turned into Bitcoin (cbBTC) automatically and can be claimed at any time. Runs on [Base](https://base.org).

> ⚠️ **Beta, not externally audited.** Do not use with money you cannot afford to lose.

## How it works

```
User ──USDC/ETH──▶ BtcYieldVault ──▶ AaveV3Strategy ──▶ Aave V3 (interest)
                         │
              Keeper ──harvest()──▶ OracleUniswapSwapper ──▶ Uniswap V3 ──▶ cbBTC
                         │                 ▲
                         │          Chainlink price as floor
                         ▼
                 claim() ──cbBTC──▶ User
```

- **Principal 1:1:** deposit 1,000 USDC = 1,000 shares = withdraw 1,000 USDC any time.
- **Fair distribution:** interest is credited to existing holders on every deposit and withdrawal. Depositing right before a harvest does not capture other people's interest.
- **Harvest:** a keeper regularly swaps the accumulated interest into cbBTC on Uniswap. Every period has its own rate; everyone gets exactly their share.
- **Swap protection:** if the Uniswap price is more than 1 % below Chainlink, the swap is rejected (protects against MEV and a compromised keeper). Stale prices or a Base sequencer outage also block it.
- **Fee:** 10 % of the interest (performance fee), capped at 20 % in the contract. 0 % on deposits and withdrawals.

## Security model

| Role | Who | Can |
|---|---|---|
| Admin | `TimelockController` (2-day delay), controlled by the multisig | change strategy, swapper, fees, limits |
| Guardian | Multisig | pause immediately, pull funds out of the strategy |
| Keeper | Bot wallet | only `harvest()` – swap floor enforced by Chainlink |

Withdrawing and claiming always work, even while paused. The deployer keeps no rights after deployment (checked by the deploy script).

## Project structure

```
contracts/   Foundry: smart contracts, tests, deploy script
  src/BtcYieldVault.sol                 Vault ("interest becomes BTC")
  src/swappers/OracleUniswapSwapper.sol Uniswap swap with Chainlink floor
  src/strategies/AaveV3Strategy.sol     Aave V3 lending
  src/YieldVault.sol                    ERC-4626 vault (base for a future pure BTC vault)
  script/Deploy.s.sol                   Deployment incl. timelock, roles, limits
web/         Next.js frontend with hamster UI, passkey login (Base Account), English + German
keeper/      Harvest bot (Node + viem), runs daily via GitHub Actions
```

## Development

Requirements: [Foundry](https://getfoundry.sh), Node.js 20+, Git.

```bash
git clone --recursive https://github.com/gabbergandalfderreiche/hamstr.git
cd hamstr/contracts
forge test            # unit tests + tests against a copy of Base mainnet
```

### Test locally with real contracts (Base fork, test money)

```bash
# terminal 1
anvil --fork-url https://mainnet.base.org --chain-id 31337

# terminal 2
cd contracts && bash script/local-fork.sh        # deploys + 20,000 test USDC
cd ../web && npm install && npm run sync-contracts
cp .env.example .env.local                        # set NEXT_PUBLIC_NETWORK=fork
npm run dev                                       # http://localhost:3000/app → "Test wallet (local)"

# move time forward + harvest like the keeper
cd contracts && HOURS=12 bash script/local-harvest.sh
```

The local scripts use anvil's public test keys. **Never use these addresses on a real network** – on Base mainnet they carry EIP-7702 "sweeper" delegations that steal incoming ETH.

### Mainnet deployment

```bash
cd contracts
MULTISIG=0x... KEEPER=0x... TREASURY=0x... \
  forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --account <keystore>
cd ../web && npm run sync-contracts
```

Beta defaults (override via environment variables): 2-day timelock, 50,000 USDC / 5,000 USDC per person, 15 ETH / 1.5 ETH per person, 10 % performance fee, max. 1 % deviation from Chainlink, Chainlink prices at most 1 h old (ETH, cbBTC) or 25 h (USDC).

### Keeper (daily harvest)

[`keeper/src/keeper.mjs`](keeper/src/keeper.mjs) harvests both vaults, but only when it pays off:

1. skips paused vaults and amounts below `minHarvest`
2. values the interest in USD and sats via Chainlink
3. simulates `harvest()` first – stale prices, a deficit or a missing role cost no gas
4. estimates the fee (L2 + L1 data) and only harvests when the interest is worth ≥ 5× the fee
5. sets its own minimum output (0.75 % below Chainlink) on top of the swapper's floor

Runs daily via [GitHub Actions](.github/workflows/keeper.yml). Add `BASE_RPC_URL` and `KEEPER_PRIVATE_KEY` under *Settings → Secrets → Actions* and fund the keeper wallet with ~0.005 ETH on Base. Until the mainnet deployment the job simply exits. Real problems (stale oracle, deficit, missing role, low gas balance) fail the run → GitHub sends an e-mail.

Note: GitHub pauses scheduled workflows in public repos after 60 days without commits – re-enable it under *Actions*.

```bash
# test locally against the fork (anvil gas prices are ~170x higher than Base, so lower the threshold)
cd contracts && HOURS=24 SKIP_HARVEST=1 bash script/local-harvest.sh
cd .. && RPC_URL=http://127.0.0.1:8545 DEPLOYMENT=contracts/deployments/31337.json \
  KEEPER_PRIVATE_KEY=<anvil #0> MIN_PROFIT_MULTIPLE=0.05 node keeper/src/keeper.mjs
```

### Languages

The website is available in English and German (`/en/...`, `/de/...`). Visitors without a language in the URL are redirected based on their browser language; the DE | EN switcher remembers the choice in a cookie. All texts live in [`web/src/i18n`](web/src/i18n) – `en.ts` is type-checked against `de.ts`, so a missing translation fails the build.

## Status

- [x] Contracts + 58 tests (incl. Base fork with real Aave, Uniswap, Chainlink)
- [x] Deploy script with timelock & roles
- [x] Frontend wired to real contracts (tested on local fork)
- [x] Website in English and German, legal notice, privacy policy, beta notice
- [x] Keeper bot (tested against fork, GitHub Actions set up)
- [ ] wstETH / Lido strategy for the ETH vault
- [ ] External audit
- [ ] Mainnet beta

## License

MIT
