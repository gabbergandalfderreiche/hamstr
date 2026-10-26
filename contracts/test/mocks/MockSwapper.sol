// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ISwapper} from "../../src/interfaces/ISwapper.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Swaps at a fixed, settable rate: out = amountIn * num / den. Mints the output token.
contract MockSwapper is ISwapper {
    uint256 public num;
    uint256 public den;

    constructor(uint256 num_, uint256 den_) {
        setRate(num_, den_);
    }

    function setRate(uint256 num_, uint256 den_) public {
        num = num_;
        den = den_;
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        IERC20(tokenIn).transferFrom(msg.sender, address(this), amountIn);
        amountOut = amountIn * num / den;
        require(amountOut >= minAmountOut, "slippage");
        MockERC20(tokenOut).mint(recipient, amountOut);
    }
}
