// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Swaps `amountIn` of `tokenIn` (pulled from the caller) into `tokenOut` for `recipient`.
/// Implementations must revert if they cannot deliver at least `minAmountOut`.
interface ISwapper {
    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut);
}
