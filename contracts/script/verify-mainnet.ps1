# Verifies all Hamstr contracts on Sourcify (free, no key; shown by Blockscout and other explorers).
#
#   powershell -ExecutionPolicy Bypass -File contracts\script\verify-mainnet.ps1
#
# With $env:ETHERSCAN_API_KEY set it verifies on Basescan instead - that needs a paid Etherscan plan
# for Base since late 2025. Addresses come from contracts/deployments/8453.json; constructor arguments
# are read from the creation transactions. Safe to run again: verified contracts are skipped.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$d = Get-Content deployments/8453.json -Raw | ConvertFrom-Json
$verifier = if ($env:ETHERSCAN_API_KEY) { @("--etherscan-api-key", $env:ETHERSCAN_API_KEY) } else { @("--verifier", "sourcify") }

$contracts = @(
  @{ name = "Timelock";      addr = $d.timelock;     id = "lib/openzeppelin-contracts/contracts/governance/TimelockController.sol:TimelockController" },
  @{ name = "Swapper";       addr = $d.swapper;      id = "src/swappers/OracleUniswapSwapper.sol:OracleUniswapSwapper" },
  @{ name = "USDC vault";    addr = $d.usdcVault;    id = "src/BtcYieldVault.sol:BtcYieldVault" },
  @{ name = "USDC strategy"; addr = $d.usdcStrategy; id = "src/strategies/AaveV3Strategy.sol:AaveV3Strategy" },
  @{ name = "ETH vault";     addr = $d.ethVault;     id = "src/BtcYieldVault.sol:BtcYieldVault" },
  @{ name = "ETH strategy";  addr = $d.ethStrategy;  id = "src/strategies/AaveV3Strategy.sol:AaveV3Strategy" },
  @{ name = "Turbo swapper"; addr = $d.turboSwapper; id = "src/swappers/OracleUniswapSwapper.sol:OracleUniswapSwapper" },
  @{ name = "Turbo vault";   addr = $d.turboVault;   id = "src/TurboVault.sol:TurboVault" }
)

$failed = @()
foreach ($c in $contracts) {
  if (-not $c.addr) { continue }
  Write-Host ""
  Write-Host "==> $($c.name) $($c.addr)" -ForegroundColor Yellow
  & $forge verify-contract $c.addr $c.id `
    --chain base `
    --rpc-url https://mainnet.base.org `
    @verifier `
    --guess-constructor-args `
    --watch
  if ($LASTEXITCODE -ne 0) { $failed += $c.name }
}

Write-Host ""
if ($failed.Count -eq 0) {
  Write-Host "All contracts verified. Check e.g. https://repo.sourcify.dev/8453/$($d.usdcVault)" -ForegroundColor Green
} else {
  Write-Host "Not verified: $($failed -join ', ') - send Claude the output above." -ForegroundColor Red
  exit 1
}
