# Adds the HIGH-RISK Turbo vault to the live Hamstr deployment on Base mainnet.
#
#   powershell -ExecutionPolicy Bypass -File contracts\script\deploy-turbo-mainnet.ps1
#
# Reads timelock / Phantom (multisig + treasury) / keeper from contracts/deployments/8453.json and
# signs with the encrypted Foundry keystore "hamstr-deployer" (asks for its password).
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$forge = Join-Path $env:USERPROFILE ".foundry\bin\forge.exe"
$deployer = "0x1FB9c031D446BF392ea3D92ffB22de90819F711B"

# Own money only: tiny limits, raise later through the timelock.
$env:TURBO_CAP = "500000000000000000"        # 0.5 ETH in total
$env:TURBO_USER_CAP = "200000000000000000"   # 0.2 ETH per address
$env:TURBO_HALF_WIDTH_TICKS = "800"          # range about +/- 8 %

Write-Host ""
Write-Host "Hamstr TURBO deployment to Base mainnet (high risk)" -ForegroundColor Red
Write-Host "  Pool          : Uniswap V3 WETH/cbBTC 0.05 %"
Write-Host "  Range         : about +/- 8 % around the price, keeper re-centers"
Write-Host "  Limits        : 0.5 ETH total / 0.2 ETH per address"
Write-Host "  Admin         : existing timelock (2 days), guardian = Phantom, keeper = $deployer"
Write-Host ""
$answer = Read-Host "Type TURBO to send the transactions"
if ($answer -ne "TURBO") { Write-Host "Cancelled."; exit 1 }

& $forge script script/DeployTurbo.s.sol --rpc-url https://mainnet.base.org --broadcast --account hamstr-deployer --sender $deployer
if ($LASTEXITCODE -ne 0) { Write-Host "Deployment failed." -ForegroundColor Red; exit $LASTEXITCODE }

Write-Host ""
Write-Host "Done. Turbo addresses added to contracts/deployments/8453.json - tell Claude it's deployed." -ForegroundColor Green
