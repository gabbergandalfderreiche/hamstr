// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice A strategy invests the vault's asset somewhere else and gives it back on request.
/// Only the vault it belongs to may move funds.
interface IStrategy {
    /// @notice The token the strategy takes and returns (same as the vault's asset).
    function asset() external view returns (address);

    /// @notice The vault this strategy belongs to.
    function vault() external view returns (address);

    /// @notice Everything the strategy currently holds, valued in `asset`.
    function totalAssets() external view returns (uint256);

    /// @notice Invest `amount` of asset that the vault has already transferred to the strategy.
    function deposit(uint256 amount) external;

    /// @notice Send exactly `amount` of asset back to the vault.
    function withdraw(uint256 amount) external;

    /// @notice Send everything back to the vault. Used when switching strategies or in an emergency.
    function withdrawAll() external returns (uint256 amount);
}
