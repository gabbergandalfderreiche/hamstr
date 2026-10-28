# DefiLlama listing – Hamstr

Files for a pull request to [DefiLlama/DefiLlama-Adapters](https://github.com/DefiLlama/DefiLlama-Adapters):

- `projects/hamstr/index.js` → copy to `projects/hamstr/index.js` in the fork
- `hamstr-logo.png` / `hamstr-logo.svg` → attach the PNG to the PR description

Fields marked **TODO** need your input before submitting.

---

**Title:** `Add Hamstr TVL adapter (Base)`

**Body:**

##### Name (to be shown on DefiLlama):
Hamstr

##### Twitter Link:
**TODO** (e.g. https://x.com/…)

##### List of audit links if any:
No external audit yet. Automated analysis (Slither, 0 high findings) and 73 Foundry tests incl. Base mainnet forks: https://github.com/gabbergandalfderreiche/hamstr/blob/main/SECURITY.md

##### Website Link:
https://www.hamstr.online

##### Logo (High resolution, will be shown with rounded borders):
(attach hamstr-logo.png)

##### Current TVL:
~$2 (beta with deposit caps)

##### Treasury Addresses (if the protocol has treasury)
**TODO** – leave empty, or add the fee recipient if you want it shown publicly

##### Chain:
Base

##### Coingecko ID:

##### Coinmarketcap ID:

##### Short Description (to be shown on DefiLlama):
Park dollars or ETH, earn interest in Bitcoin. Hamstr lends deposits on Aave V3 and swaps only the yield into cbBTC – the principal stays in USDC or ETH. A separate high-risk Turbo vault provides WETH/cbBTC liquidity on Uniswap V3.

##### Token address and ticker if any:
No token.

##### Category (full list at https://defillama.com/categories):
Yield Aggregator

##### Oracle Provider(s):
Chainlink

##### Implementation Details:
Chainlink ETH/USD, cbBTC/USD and USDC/USD feeds set a minimum output for every yield swap (max. 1 % below the oracle price, with staleness and L2 sequencer checks). The Turbo vault prices its shares with Chainlink and refuses actions when the Uniswap pool price deviates more than 1 % from the oracle.

##### Documentation/Proof:
https://github.com/gabbergandalfderreiche/hamstr/blob/main/contracts/src/swappers/OracleUniswapSwapper.sol
https://github.com/gabbergandalfderreiche/hamstr/blob/main/contracts/src/TurboVault.sol

##### forkedFrom (Does your project originate from another project):
No (built on OpenZeppelin contracts).

##### methodology (what is being counted as tvl, how is tvl being calculated):
USDC and ETH principal in the two BtcYieldVaults (`totalAssets()`, lent on Aave V3 through a strategy), unclaimed cbBTC rewards held by those vaults, and the Turbo vault's Uniswap V3 WETH/cbBTC position via `totalAssets()` (valued in WETH). Marked `doublecounted` because the funds are also counted in Aave V3 and Uniswap V3.

##### Github org/user (Optional):
gabbergandalfderreiche

##### Does this project have a referral program?
No.
