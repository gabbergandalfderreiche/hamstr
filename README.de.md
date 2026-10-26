# hamstr

🇬🇧 [English](README.md) · 🇩🇪 Deutsch

DeFi BTC maxi aggregator: **Bitcoin hamstern. Automatisch.**

Nutzer zahlen USDC oder ETH ein. Das Kapital bleibt, wo es ist – nur die Zinsen werden automatisch zu Bitcoin (cbBTC) und können jederzeit abgeholt werden. Läuft auf [Base](https://base.org).

> ⚠️ **Beta, nicht extern auditiert.** Nicht mit Geld nutzen, dessen Verlust du nicht verkraften kannst.

## So funktioniert's

```
Nutzer ──USDC/ETH──▶ BtcYieldVault ──▶ AaveV3Strategy ──▶ Aave V3 (Zinsen)
                         │
              Keeper ──harvest()──▶ OracleUniswapSwapper ──▶ Uniswap V3 ──▶ cbBTC
                         │                 ▲
                         │          Chainlink-Preis als Untergrenze
                         ▼
                 claim() ──cbBTC──▶ Nutzer
```

- **Kapital 1:1:** 1.000 USDC rein = 1.000 Anteile = jederzeit 1.000 USDC raus.
- **Faire Verteilung:** Zinsen werden bei jeder Ein-/Auszahlung den bisherigen Haltern gutgeschrieben. Wer kurz vor einem Harvest einzahlt, bekommt keine fremden Zinsen.
- **Harvest:** Ein Keeper tauscht die gesammelten Zinsen regelmäßig über Uniswap in cbBTC. Jede Periode hat ihren eigenen Kurs; jeder bekommt exakt seinen Anteil.
- **Swap-Schutz:** Liegt der Uniswap-Kurs mehr als 1 % unter Chainlink, wird der Tausch abgelehnt (schützt vor MEV und einem kompromittierten Keeper). Veraltete Preise oder ein ausgefallener Sequencer blockieren ebenfalls.
- **Gebühr:** 10 % der Zinsen (Performance-Fee), im Contract auf max. 20 % gedeckelt. 0 % Ein-/Auszahlung.

## Sicherheitsmodell

| Rolle | Wer | Darf |
|---|---|---|
| Admin | `TimelockController` (2 Tage Verzögerung), gesteuert vom Multisig | Strategie, Swapper, Gebühren, Limits ändern |
| Guardian | Multisig | Sofort pausieren, Gelder aus der Strategie zurückholen |
| Keeper | Bot-Wallet | Nur `harvest()` – Swap-Untergrenze durch Chainlink |

Auszahlen und Abholen funktionieren immer, auch wenn pausiert ist. Der Deployer behält nach dem Deployment keinerlei Rechte (wird im Deploy-Script geprüft).

## Projektstruktur

```
contracts/   Foundry: Smart Contracts, Tests, Deploy-Script
  src/BtcYieldVault.sol                 Vault (Variante "Zinsen werden zu BTC")
  src/swappers/OracleUniswapSwapper.sol Uniswap-Swap mit Chainlink-Untergrenze
  src/strategies/AaveV3Strategy.sol     Aave-V3-Lending
  src/YieldVault.sol                    ERC-4626-Vault (Basis für einen späteren reinen BTC-Vault)
  script/Deploy.s.sol                   Deployment inkl. Timelock, Rollen, Limits
web/         Next.js-Frontend mit Hamster-UI, Passkey-Login (Base Account), Deutsch + Englisch
keeper/      Harvest-Bot (Node + viem), läuft täglich per GitHub Actions
```

## Entwicklung

Voraussetzungen: [Foundry](https://getfoundry.sh), Node.js 20+, Git.

```bash
git clone --recursive https://github.com/gabbergandalfderreiche/hamstr.git
cd hamstr/contracts
forge test            # Unit-Tests + Tests gegen eine Kopie des Base-Mainnets
```

### Lokal mit echten Contracts testen (Base-Fork, Testgeld)

```bash
# Terminal 1
anvil --fork-url https://mainnet.base.org --chain-id 31337

# Terminal 2
cd contracts && bash script/local-fork.sh        # deployt + 20.000 Test-USDC
cd ../web && npm install && npm run sync-contracts
cp .env.example .env.local                        # NEXT_PUBLIC_NETWORK=fork setzen
npm run dev                                       # http://localhost:3000/app → "Test-Wallet (lokal)"

# Zeit vorspulen + Harvest wie der Keeper
cd contracts && HOURS=12 bash script/local-harvest.sh
```

Die lokalen Scripts nutzen die öffentlichen Anvil-Testschlüssel. **Diese Adressen niemals auf einem echten Netzwerk verwenden** – auf Base-Mainnet haben sie EIP-7702-"Sweeper"-Delegationen, die eingehendes ETH stehlen.

### Mainnet-Deployment

```bash
cd contracts
MULTISIG=0x... KEEPER=0x... TREASURY=0x... \
  forge script script/Deploy.s.sol --rpc-url https://mainnet.base.org --broadcast --account <keystore>
cd ../web && npm run sync-contracts
```

Beta-Standardwerte (per Umgebungsvariable änderbar): Timelock 2 Tage, 50.000 USDC / 5.000 USDC pro Person, 15 ETH / 1,5 ETH pro Person, 10 % Performance-Fee, 1 % max. Abweichung von Chainlink, Chainlink-Preise max. 1 h alt (ETH, cbBTC) bzw. 25 h (USDC).

### Keeper (täglicher Harvest)

[`keeper/src/keeper.mjs`](keeper/src/keeper.mjs) harvestet beide Vaults, aber nur, wenn es sich lohnt:

1. überspringt pausierte Vaults und Beträge unter `minHarvest`
2. bewertet die Zinsen per Chainlink in USD und Sats
3. simuliert `harvest()` vorab – veraltete Preise, Defizit oder fehlende Rolle kosten so kein Gas
4. schätzt die Gebühr (L2 + L1-Daten) und harvestet nur, wenn die Zinsen ≥ 5× die Gebühr wert sind
5. setzt eine eigene Mindestmenge (0,75 % unter Chainlink) zusätzlich zur Grenze im Swapper

Läuft täglich per [GitHub Actions](.github/workflows/keeper.yml). Dafür im Repo unter *Settings → Secrets → Actions* `BASE_RPC_URL` und `KEEPER_PRIVATE_KEY` anlegen und die Keeper-Wallet mit ~0,005 ETH auf Base füllen. Bis zum Mainnet-Deployment beendet sich der Job einfach. Echte Probleme (veraltetes Oracle, Defizit, fehlende Rolle, wenig Gas-Guthaben) lassen den Lauf fehlschlagen → GitHub schickt eine E-Mail.

Hinweis: GitHub pausiert geplante Workflows in öffentlichen Repos nach 60 Tagen ohne Commits – dann unter *Actions* wieder aktivieren.

```bash
# lokal gegen den Fork testen (Anvil hat ~170x höhere Gaspreise als Base, daher Schwelle senken)
cd contracts && HOURS=24 SKIP_HARVEST=1 bash script/local-harvest.sh
cd .. && RPC_URL=http://127.0.0.1:8545 DEPLOYMENT=contracts/deployments/31337.json \
  KEEPER_PRIVATE_KEY=<anvil #0> MIN_PROFIT_MULTIPLE=0.05 node keeper/src/keeper.mjs
```

## Status

- [x] Contracts + 58 Tests (inkl. Base-Fork mit echtem Aave, Uniswap, Chainlink)
- [x] Deploy-Script mit Timelock & Rollen
- [x] Frontend an echte Contracts angebunden (lokaler Fork getestet)
- [x] Website auf Deutsch und Englisch, Impressum, Datenschutz, Beta-Hinweis
- [x] Keeper-Bot (lokal gegen Fork getestet, GitHub Actions eingerichtet)
- [ ] wstETH-/Lido-Strategie für den ETH-Vault
- [ ] Externes Audit
- [ ] Mainnet-Beta

## Lizenz

MIT
