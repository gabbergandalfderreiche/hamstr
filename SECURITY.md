# Security

> **Status: not externally audited.** Hamstr is beta software with small deposit limits. Do not deposit money you cannot afford to lose.

## What is in place

| | |
|---|---|
| Open source | All contracts in [`contracts/src`](contracts/src), MIT (TurboVault includes GPL-2.0 Uniswap math) |
| Verified source | All mainnet contracts verified on [Sourcify](https://repo.sourcify.dev/8453/0x3647c58c7eF2f4E871Cb3390E21ddD211242aADA) |
| Tests | 73 Foundry tests, incl. forks of Base mainnet with the real Aave, Uniswap and Chainlink |
| Admin changes | Only through a `TimelockController` with a 2-day delay |
| Emergency | Guardian can pause deposits and pull funds out of strategies; withdrawals always stay open |
| Limits | Per-address and total deposit caps during the beta |
| Oracle checks | Swaps and Turbo actions refuse prices more than 1 % away from Chainlink, stale prices and a down sequencer |

## Automated analysis (Slither)

Run with [Slither](https://github.com/crytic/slither) 0.11.3 on 26 Oct 2026 over `contracts/src` (libraries, tests and scripts excluded). This is a static analysis tool, **not an audit**.

| Impact | Findings | Assessment |
|---|---|---|
| High | 0 | – |
| Medium | 64 | All reviewed, none exploitable (see below) |
| Low | 24 | Expected patterns (timestamps for fees/oracle age, events after external calls) |
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
