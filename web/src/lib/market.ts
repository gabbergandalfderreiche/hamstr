import { parseAbi } from "viem";

/** Aave V3 Pool on Base (also valid on a local fork of Base). */
export const AAVE_POOL = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as const;

export const aavePoolAbi = parseAbi([
  "function getConfiguration(address asset) view returns (uint256)",
  "function getReserveData(address asset) view returns ((uint256 configuration, uint128 liquidityIndex, uint128 currentLiquidityRate, uint128 variableBorrowIndex, uint128 currentVariableBorrowRate, uint128 currentStableBorrowRate, uint40 lastUpdateTimestamp, uint16 id, address aTokenAddress, address stableDebtTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint128 accruedToTreasury, uint128 unbacked, uint128 isolationModeTotalDebt))",
]);

// Bits of Aave's ReserveConfigurationMap.
const ACTIVE_BIT = 56n;
const FROZEN_BIT = 57n;
const PAUSED_BIT = 60n;
const bit = (config: bigint, n: bigint) => ((config >> n) & 1n) === 1n;

/** Aave rejects new supply when a reserve is inactive, frozen or paused. */
export function isSupplyBlocked(config: bigint) {
  return !bit(config, ACTIVE_BIT) || bit(config, FROZEN_BIT) || bit(config, PAUSED_BIT);
}

const SECONDS_PER_YEAR = 31_536_000;

/** Aave reports a yearly rate in ray (1e27), compounded per second. Returns APY as a fraction (0.04 = 4 %). */
export function rayRateToApy(rate: bigint) {
  const apr = Number(rate) / 1e27;
  return (1 + apr / SECONDS_PER_YEAR) ** SECONDS_PER_YEAR - 1;
}
