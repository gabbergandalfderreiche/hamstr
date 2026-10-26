// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IStrategy} from "../../src/interfaces/IStrategy.sol";

/// @dev Holds the asset as-is. Tests mint to / burn from it to simulate yield and losses.
contract MockStrategy is IStrategy {
    address public immutable override asset;
    address public immutable override vault;

    constructor(address vault_, address asset_) {
        vault = vault_;
        asset = asset_;
    }

    function totalAssets() external view returns (uint256) {
        return IERC20(asset).balanceOf(address(this));
    }

    function deposit(uint256) external view {
        require(msg.sender == vault, "only vault");
    }

    function withdraw(uint256 amount) external {
        require(msg.sender == vault, "only vault");
        IERC20(asset).transfer(vault, amount);
    }

    function withdrawAll() external returns (uint256 amount) {
        require(msg.sender == vault, "only vault");
        amount = IERC20(asset).balanceOf(address(this));
        IERC20(asset).transfer(vault, amount);
    }
}
