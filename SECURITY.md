# Security

> **Status: not externally audited.** Hamstr is beta software with small deposit limits. Do not deposit money you cannot afford to lose.

## What is in place

| | |
|---|---|
| Open source | All contracts in [`contracts/src`](contracts/src), MIT (TurboVault includes GPL-2.0 Uniswap math) |
| Verified source | All 8 mainnet contracts verified (exact match) on [Basescan](https://basescan.org/address/0x3647c58c7eF2f4E871Cb3390E21ddD211242aADA#code) and [Sourcify](https://repo.sourcify.dev/8453/0x3647c58c7eF2f4E871Cb3390E21ddD211242aADA) |
| Tests | 87 Foundry tests, incl. 43 on forks of Base mainnet with the real Aave, Uniswap and Chainlink |
| Admin changes | Only through a `TimelockController` with a 2-day delay |
| Emergency | Guardian can pause deposits and pull funds out of strategies; withdrawals stay open while paused (see the limits below) |
| Limits | Per-address and total deposit caps during the beta |
| Oracle checks | Swaps and Turbo actions refuse prices more than 1 % away from Chainlink, stale prices and a down sequencer |

## Known limits of withdrawals

Withdrawals do not depend on the guardian or the admin, but they do depend on the protocols underneath:

- **Dollar and ETH Hamster:** a withdrawal takes the money out of Aave. If Aave has lent out nearly all of a reserve (utilization close to 100 %), a large withdrawal can have to wait until borrowers repay or Aave's rates attract new deposits. Claiming cbBTC never depends on Aave.
- **Turbo Hamster (live contract `0xd303…52e6`):** a withdrawal is paid out in ETH, so the cbBTC part is swapped and the pool price is checked against Chainlink first. It reverts while a Chainlink price is older than its limit, while the Base sequencer is down or within one hour of restarting, or while the pool is more than 1 % away from Chainlink, also after an emergency exit. Such blocks end on their own once prices are current again; a lasting outage would need a new swapper through the 2-day timelock. Claiming fees as WETH + cbBTC (`claim(receiver, false)`) needs no oracle.
- **Turbo Hamster v2 (in the repo, not deployed yet):** adds `withdrawInKind`, which pays a share out as WETH + cbBTC without any oracle or swap. It also works while paused, after an emergency exit and during an oracle or sequencer outage; optional minimums per token protect against an unfavourable pool price.
- **Turbo pricing:** deposits are valued at the Chainlink price, withdrawals in ETH at the pool price. Within the 1 % band a deposit-and-withdraw round trip can gain a little at the expense of other holders; the deposit caps keep this small.

The Turbo withdrawal issue was reported by an external security team in November 2026. Thank you.

## Automated analysis (Slither)

Run with [Slither](https://github.com/crytic/slither) 0.11.3 on 22 Nov 2026 over `contracts/src` (libraries, tests and scripts excluded). This is a static analysis tool, **not an audit**.

| Impact | Findings | Assessment |
|---|---|---|
| High | 0 | – |
| Medium | 64 | All reviewed, none exploitable (see below) |
| Low | 26 | Expected patterns (timestamps for fees/oracle age, events after external calls) |
| Informational | 4 | Style |

Medium findings, reviewed one by one:

- **divide-before-multiply (20):** 19 in `TickMath.getSqrtRatioAtTick`, Uniswap's own algorithm ported unchanged; 1 in `TurboVault._floorTick`, intentional rounding down to the tick spacing.
- **incorrect-equality (18):** control-flow checks against zero (`positionId == 0`, `supply == 0`, `amount == 0`), not against balances an attacker could steer.
- **reentrancy-no-eth (9):** external calls only go to trusted contracts (Uniswap position manager, Aave via the strategy, Hamstr's swapper); every user entry point is `nonReentrant`.
- **unused-return (17):** deliberately ignored values (unused `slot0()` fields, mint/increase return values); where amounts matter the code measures actual balance changes.

Reproduce:

```bash
cd contracts
pip install slither-analyzer==0.11.3
slither . --filter-paths "lib/|test/|script/" --exclude-dependencies
```

## Reporting a vulnerability

Please **do not** open a public issue. Use GitHub's private reporting: *Security → Report a vulnerability* in this repository.
