// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ISwapper} from "../interfaces/ISwapper.sol";
import {IChainlinkAggregator, IUniswapV3SwapRouter02} from "../interfaces/IExternal.sol";

/// @title OracleUniswapSwapper
/// @notice Swaps through a fixed Uniswap V3 route and refuses any trade that pays out less than the
/// Chainlink fair value minus `maxSlippageBps`. This protects the vault's yield from sandwich bots
/// and from a compromised keeper passing a minimum of zero.
/// Ownership is single-step on purpose: the deploy script configures it and hands it straight to
/// the timelock, which could otherwise only accept it through a separate delayed proposal.
contract OracleUniswapSwapper is ISwapper, Ownable {
    using SafeERC20 for IERC20;
    using Math for uint256;

    uint256 public constant MAX_BPS = 10_000;
    /// @notice Owner can never allow more than 5% below oracle value.
    uint256 public constant MAX_SLIPPAGE_LIMIT = 500;
    /// @notice After the L2 sequencer comes back up, prices are not trusted for this long.
    uint256 public constant SEQUENCER_GRACE_PERIOD = 1 hours;

    struct Feed {
        IChainlinkAggregator aggregator;
        uint32 maxAge; // seconds after which a price counts as stale
    }

    IUniswapV3SwapRouter02 public immutable router;
    /// @notice Chainlink L2 sequencer uptime feed; zero to skip the check (e.g. on L1).
    IChainlinkAggregator public immutable sequencerFeed;

    uint256 public maxSlippageBps;
    mapping(address token => Feed) public feeds;
    /// @notice Uniswap V3 encoded path per (tokenIn, tokenOut).
    mapping(address tokenIn => mapping(address tokenOut => bytes path)) public routes;

    event FeedSet(address indexed token, address aggregator, uint32 maxAge);
    event RouteSet(address indexed tokenIn, address indexed tokenOut, bytes path);
    event MaxSlippageSet(uint256 bps);

    error NoRoute();
    error NoFeed(address token);
    error StalePrice(address token);
    error InvalidPrice(address token);
    error SequencerDown();
    error SlippageTooHigh();

    constructor(address owner_, IUniswapV3SwapRouter02 router_, IChainlinkAggregator sequencerFeed_, uint256 maxSlippageBps_)
        Ownable(owner_)
    {
        router = router_;
        sequencerFeed = sequencerFeed_;
        _setMaxSlippage(maxSlippageBps_);
    }

    /// @notice Fair value of `amountIn` of `tokenIn` in `tokenOut`, from Chainlink USD prices.
    function quote(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        _checkSequencer();
        uint256 priceIn = _price(tokenIn);
        uint256 priceOut = _price(tokenOut);
        uint256 decIn = IERC20Metadata(tokenIn).decimals();
        uint256 decOut = IERC20Metadata(tokenOut).decimals();
        return amountIn.mulDiv(priceIn * 10 ** decOut, priceOut * 10 ** decIn);
    }

    /// @notice Lowest output the swapper accepts for this trade, ignoring the caller's own minimum.
    function oracleMinOut(address tokenIn, address tokenOut, uint256 amountIn) public view returns (uint256) {
        return quote(tokenIn, tokenOut, amountIn).mulDiv(MAX_BPS - maxSlippageBps, MAX_BPS);
    }

    function swap(address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, address recipient)
        external
        returns (uint256 amountOut)
    {
        bytes memory path = routes[tokenIn][tokenOut];
        if (path.length == 0) revert NoRoute();

        uint256 floor = Math.max(minAmountOut, oracleMinOut(tokenIn, tokenOut, amountIn));

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(tokenIn).forceApprove(address(router), amountIn);
        amountOut = router.exactInput(
            IUniswapV3SwapRouter02.ExactInputParams({
                path: path,
                recipient: recipient,
                amountIn: amountIn,
                amountOutMinimum: floor
            })
        );
    }

    // ---------------------------------------------------------------------
    // Owner (timelock)
    // ---------------------------------------------------------------------

    function setFeed(address token, IChainlinkAggregator aggregator, uint32 maxAge) external onlyOwner {
        feeds[token] = Feed(aggregator, maxAge);
        emit FeedSet(token, address(aggregator), maxAge);
    }

    /// @param path abi.encodePacked(tokenIn, uint24 fee, [token, uint24 fee, ...] tokenOut)
    function setRoute(address tokenIn, address tokenOut, bytes calldata path) external onlyOwner {
        routes[tokenIn][tokenOut] = path;
        emit RouteSet(tokenIn, tokenOut, path);
    }

    function setMaxSlippage(uint256 bps) external onlyOwner {
        _setMaxSlippage(bps);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    /// @dev USD price scaled to 18 decimals.
    function _price(address token) internal view returns (uint256) {
        Feed memory f = feeds[token];
        if (address(f.aggregator) == address(0)) revert NoFeed(token);
        (, int256 answer,, uint256 updatedAt,) = f.aggregator.latestRoundData();
        if (answer <= 0) revert InvalidPrice(token);
        if (block.timestamp - updatedAt > f.maxAge) revert StalePrice(token);
        return uint256(answer) * 10 ** (18 - f.aggregator.decimals());
    }

    function _checkSequencer() internal view {
        if (address(sequencerFeed) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = sequencerFeed.latestRoundData();
        // answer 0 = up, 1 = down
        if (answer != 0 || block.timestamp - startedAt <= SEQUENCER_GRACE_PERIOD) revert SequencerDown();
    }

    function _setMaxSlippage(uint256 bps) internal {
        if (bps > MAX_SLIPPAGE_LIMIT) revert SlippageTooHigh();
        maxSlippageBps = bps;
        emit MaxSlippageSet(bps);
    }
}
