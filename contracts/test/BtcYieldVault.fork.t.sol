// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BtcYieldVault} from "../src/BtcYieldVault.sol";
import {AaveV3Strategy} from "../src/strategies/AaveV3Strategy.sol";
import {OracleUniswapSwapper} from "../src/swappers/OracleUniswapSwapper.sol";
import {IAaveV3AToken} from "../src/interfaces/IAaveV3.sol";
import {IChainlinkAggregator, IUniswapV3SwapRouter02} from "../src/interfaces/IExternal.sol";
import {BaseAddresses as B} from "../script/BaseAddresses.sol";

/// @notice Full flow on a copy of Base mainnet: real Aave yield, real Uniswap swap into cbBTC,
/// real Chainlink prices as the swap's safety floor.
contract BtcYieldVaultForkTest is Test {
    OracleUniswapSwapper swapper;
    BtcYieldVault usdcVault;
    BtcYieldVault ethVault;

    address admin = makeAddr("hamstr-admin");
    address guardian = makeAddr("hamstr-guardian");
    address keeper = makeAddr("hamstr-keeper");
    address treasury = makeAddr("hamstr-treasury");
    // Avoid forge's well-known default names; some have EIP-7702 delegations on Base.
    address user = makeAddr("hamstr-fork-user");

    address[3] feeds = [B.FEED_USDC_USD, B.FEED_ETH_USD, B.FEED_CBBTC_USD];
    int256[3] prices;

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        for (uint256 i; i < feeds.length; i++) {
            (, prices[i],,,) = IChainlinkAggregator(feeds[i]).latestRoundData();
        }

        swapper = new OracleUniswapSwapper(
            admin, IUniswapV3SwapRouter02(B.UNISWAP_ROUTER), IChainlinkAggregator(B.SEQUENCER_UPTIME), 100
        );
        vm.startPrank(admin);
        swapper.setFeed(B.USDC, IChainlinkAggregator(B.FEED_USDC_USD), 25 hours);
        swapper.setFeed(B.WETH, IChainlinkAggregator(B.FEED_ETH_USD), 25 hours);
        swapper.setFeed(B.CBBTC, IChainlinkAggregator(B.FEED_CBBTC_USD), 25 hours);
        swapper.setRoute(B.USDC, B.CBBTC, abi.encodePacked(B.USDC, B.FEE_USDC_CBBTC, B.CBBTC));
        swapper.setRoute(B.WETH, B.CBBTC, abi.encodePacked(B.WETH, B.FEE_WETH_CBBTC, B.CBBTC));
        vm.stopPrank();

        usdcVault = _vault(B.USDC, B.AAVE_A_USDC, address(0), "Hamstr Dollar", "hamUSDC");
        ethVault = _vault(B.WETH, B.AAVE_A_WETH, B.WETH, "Hamstr Ether", "hamETH");
    }

    function _vault(address asset, address aToken, address weth, string memory name, string memory symbol)
        internal
        returns (BtcYieldVault v)
    {
        v = new BtcYieldVault(
            BtcYieldVault.Config({
                asset: IERC20(asset),
                rewardToken: IERC20(B.CBBTC),
                name: name,
                symbol: symbol,
                admin: admin,
                guardian: guardian,
                keeper: keeper,
                feeRecipient: treasury,
                performanceFee: 1_000,
                weth: weth
            })
        );
        AaveV3Strategy s = new AaveV3Strategy(address(v), asset, IAaveV3AToken(aToken));
        vm.startPrank(admin);
        v.setStrategy(s);
        v.setSwapper(swapper);
        vm.stopPrank();
    }

    /// Chainlink prices go stale when we jump 30 days ahead; replay the real prices as fresh.
    function _refreshFeeds() internal {
        for (uint256 i; i < feeds.length; i++) {
            _mockPrice(feeds[i], prices[i]);
        }
    }

    function _mockPrice(address feed, int256 price) internal {
        vm.mockCall(
            feed,
            abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            abi.encode(uint80(1), price, block.timestamp, block.timestamp, uint80(1))
        );
    }

    function test_Fork_UsdcYieldBecomesBitcoin() public {
        uint256 amount = 100_000e6;
        deal(B.USDC, user, amount);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(usdcVault), amount);
        usdcVault.deposit(amount, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        _refreshFeeds();

        uint256 yield_ = usdcVault.unrealizedYield();
        assertGt(yield_, 0, "Aave paid interest");
        emit log_named_decimal_uint("USDC yield in 30 days", yield_, 6);

        uint256 fair = swapper.quote(B.USDC, B.CBBTC, yield_);
        vm.prank(keeper);
        uint256 out = usdcVault.harvest(0);
        emit log_named_decimal_uint("Swapped into cbBTC", out, 8);
        assertGe(out, fair * 99 / 100, "within 1% of Chainlink value");

        vm.prank(user);
        uint256 claimed = usdcVault.claim(user);
        assertApproxEqAbs(claimed, out * 9 / 10, 2, "user gets 90%");
        assertEq(IERC20(B.CBBTC).balanceOf(user), claimed);
        emit log_named_decimal_uint("User claimed cbBTC", claimed, 8);

        vm.prank(user);
        uint256 back = usdcVault.withdraw(amount, user, user);
        assertEq(back, amount, "exact principal back");
        assertEq(IERC20(B.USDC).balanceOf(user), amount);
    }

    function test_Fork_EthLendingYieldBecomesBitcoin() public {
        vm.deal(user, 10 ether);
        vm.prank(user);
        ethVault.depositETH{value: 10 ether}(user);

        vm.warp(block.timestamp + 30 days);
        _refreshFeeds();

        vm.prank(keeper);
        uint256 out = ethVault.harvest(0);
        assertGt(out, 0);
        emit log_named_decimal_uint("ETH vault: cbBTC from 30 days", out, 8);

        vm.prank(user);
        ethVault.withdrawETH(10 ether, user, user);
        assertEq(user.balance, 10 ether, "exact ETH back");

        vm.prank(user);
        assertGt(ethVault.claim(user), 0);
    }

    /// If Uniswap pays much less than Chainlink says the yield is worth, the harvest must fail.
    function test_Fork_OracleBlocksBadSwap() public {
        deal(B.USDC, user, 100_000e6);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(usdcVault), 100_000e6);
        usdcVault.deposit(100_000e6, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days);
        _refreshFeeds();
        // Pretend the oracle says BTC is half the price -> fair value is twice what Uniswap pays.
        _mockPrice(B.FEED_CBBTC_USD, prices[2] / 2);

        vm.prank(keeper);
        vm.expectRevert(); // Uniswap: "Too little received"
        usdcVault.harvest(0);
    }

    function test_Fork_StalePriceBlocksSwap() public {
        deal(B.USDC, user, 100_000e6);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(usdcVault), 100_000e6);
        usdcVault.deposit(100_000e6, user);
        vm.stopPrank();

        vm.warp(block.timestamp + 30 days); // feeds not refreshed

        vm.prank(keeper);
        vm.expectRevert(abi.encodeWithSelector(OracleUniswapSwapper.StalePrice.selector, B.USDC));
        usdcVault.harvest(0);
    }
}
