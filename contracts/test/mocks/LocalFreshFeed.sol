// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Local fork only (see script/local-harvest.sh): replaces a Chainlink feed's code so the last
/// real price keeps a fresh timestamp after jumping time forward. Storage: slot 0 = answer,
/// slot 1 = decimals.
contract LocalFreshFeed {
    int256 public answer;
    uint8 public decimals;

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, block.timestamp, block.timestamp, 1);
    }

    function isLocalFreshFeed() external pure returns (bool) {
        return true;
    }
}
