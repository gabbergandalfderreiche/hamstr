# Hamstr beta launch on Base mainnet.
#
#   powershell -ExecutionPolicy Bypass -File contracts\script\deploy-mainnet.ps1
#
# Signs with the encrypted Foundry keystore "hamstr-deployer" (asks for its password).
# Optional: set $env:ETHERSCAN_API_KEY first to verify the contracts on Basescan.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$deployer = "0x1FB9c031D446BF392ea3D92ffB22de90819F711B"

# Roles. MULTISIG is the Phantom wallet for now; move it to a Safe later through the timelock.
$env:MULTISIG = "0x7Ad9D41C88440b91EbdD260e5Fd99f7b74Dc46Fb"
$env:TREASURY = "0x7Ad9D41C88440b91EbdD260e5Fd99f7b74Dc46Fb"
$env:KEEPER = $deployer

# Launch limits: small on purpose, raise later through the timelock.
$env:USDC_CAP = "1000000000"                # 1,000 USDC in total
$env:USDC_USER_CAP = "1000000000"           # 1,000 USDC per address
$env:USDC_MIN_HARVEST = "1000000"           # 1 USDC
$env:ETH_CAP = "500000000000000000"         # 0.5 ETH in total
$env:ETH_USER_CAP = "500000000000000000"    # 0.5 ETH per address
$env:ETH_MIN_HARVEST = "100000000000000"    # 0.0001 ETH

Write-Host ""
Write-Host "Hamstr deployment to Base mainnet" -ForegroundColor Yellow
Write-Host "  Deployer + keeper : $deployer"
Write-Host "  Multisig role     : $env:MULTISIG (Phantom)"
Write-Host "  Treasury          : $env:TREASURY (Phantom)"
Write-Host "  USDC vault limit  : 1,000 USDC total / 1,000 per address"
Write-Host "  ETH vault limit   : 0.5 ETH total / 0.5 per address"
Write-Host "  Timelock delay    : 2 days, performance fee 10 %"
Write-Host ""
$answer = Read-Host "Type DEPLOY to send the transactions"
if ($answer -ne "DEPLOY") { Write-Host "Cancelled."; exit 1 }

$forgeArgs = @(
  "script", "script/Deploy.s.sol",
  "--rpc-url", "https://mainnet.base.org",
  "--broadcast",
  "--account", "hamstr-deployer",
  "--sender", $deployer
)
if ($env:ETHERSCAN_API_KEY) { $forgeArgs += @("--verify", "--etherscan-api-key", $env:ETHERSCAN_API_KEY) }

& $forge @forgeArgs
if ($LASTEXITCODE -ne 0) { Write-Host "Deployment failed." -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Addresses written to contracts/deployments/8453.json - tell Claude it's deployed." -ForegroundColor Green
