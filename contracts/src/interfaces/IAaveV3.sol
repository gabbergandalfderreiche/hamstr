// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice The two Aave V3 Pool functions this project uses.
interface IAaveV3Pool {
    function supply(address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;

    function withdraw(address asset, uint256 amount, address to) external returns (uint256);
}

interface IAaveV3AToken {
    function UNDERLYING_ASSET_ADDRESS() external view returns (address);

    function POOL() external view returns (address);
}
