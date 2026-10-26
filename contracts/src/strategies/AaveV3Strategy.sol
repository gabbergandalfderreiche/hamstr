// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IStrategy} from "../interfaces/IStrategy.sol";
import {IAaveV3Pool, IAaveV3AToken} from "../interfaces/IAaveV3.sol";

/// @title AaveV3Strategy
/// @notice Supplies the vault's asset to Aave V3 and earns the lending rate. The aToken balance grows
/// every second, so `totalAssets` rises without any harvesting or swapping.
/// Risk to know: if Aave's market is fully borrowed, withdrawals wait until borrowers repay.
contract AaveV3Strategy is IStrategy {
    using SafeERC20 for IERC20;

    address public immutable override asset;
    address public immutable override vault;
    IAaveV3Pool public immutable pool;
    IERC20 public immutable aToken;

    error OnlyVault();
    error ZeroAddress();
    error ATokenMismatch();

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    constructor(address vault_, address asset_, IAaveV3AToken aToken_) {
        if (vault_ == address(0) || asset_ == address(0)) revert ZeroAddress();
        if (aToken_.UNDERLYING_ASSET_ADDRESS() != asset_) revert ATokenMismatch();
        vault = vault_;
        asset = asset_;
        aToken = IERC20(address(aToken_));
        pool = IAaveV3Pool(aToken_.POOL());
    }

    function totalAssets() external view returns (uint256) {
        return aToken.balanceOf(address(this)) + IERC20(asset).balanceOf(address(this));
    }

    function deposit(uint256 amount) external onlyVault {
        IERC20(asset).forceApprove(address(pool), amount);
        pool.supply(asset, amount, address(this), 0);
    }

    function withdraw(uint256 amount) external onlyVault {
        uint256 idle = IERC20(asset).balanceOf(address(this));
        if (idle < amount) pool.withdraw(asset, amount - idle, address(this));
        IERC20(asset).safeTransfer(vault, amount);
    }

    function withdrawAll() external onlyVault returns (uint256 amount) {
        if (aToken.balanceOf(address(this)) > 0) pool.withdraw(asset, type(uint256).max, address(this));
        amount = IERC20(asset).balanceOf(address(this));
        IERC20(asset).safeTransfer(vault, amount);
    }
}
