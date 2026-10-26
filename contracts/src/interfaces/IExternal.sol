// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chainlink price feed (and L2 sequencer uptime feed) interface.
interface IChainlinkAggregator {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @notice Uniswap SwapRouter02 (IV3SwapRouter) multi-hop exact-input swap. Note: no deadline field.
interface IUniswapV3SwapRouter02 {
    struct ExactInputParams {
        bytes path;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
    }

    function exactInput(ExactInputParams calldata params) external payable returns (uint256 amountOut);
}
