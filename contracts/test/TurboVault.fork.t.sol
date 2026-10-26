// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {TurboVault} from "../src/TurboVault.sol";
import {OracleUniswapSwapper} from "../src/swappers/OracleUniswapSwapper.sol";
import {IUniswapV3Pool, INonfungiblePositionManager} from "../src/interfaces/IUniswapV3.sol";
import {IChainlinkAggregator, IUniswapV3SwapRouter02} from "../src/interfaces/IExternal.sol";
import {TickMath} from "../src/libraries/UniswapV3Math.sol";
import {BaseAddresses as B} from "../script/BaseAddresses.sol";

interface ISwapRouter02Single {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }

    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256);
}

/// @notice TurboVault against the real WETH/cbBTC Uniswap V3 pool on a Base fork.
contract TurboVaultForkTest is Test {
    IUniswapV3Pool constant POOL = IUniswapV3Pool(0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1);
    INonfungiblePositionManager constant NPM = INonfungiblePositionManager(0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1);
    IERC20 constant WETH = IERC20(B.WETH);
    IERC20 constant CBBTC = IERC20(B.CBBTC);

    TurboVault vault;
    OracleUniswapSwapper swapper;

    address admin = makeAddr("turbo-admin");
    address guardian = makeAddr("turbo-guardian");
    address keeper = makeAddr("turbo-keeper");
    address treasury = makeAddr("turbo-treasury");
    address alice = makeAddr("turbo-alice");
    address bob = makeAddr("turbo-bob");
    address trader = makeAddr("turbo-trader");

    int256 ethUsd;

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        (, ethUsd,,,) = IChainlinkAggregator(B.FEED_ETH_USD).latestRoundData();

        swapper = new OracleUniswapSwapper(
            admin, IUniswapV3SwapRouter02(B.UNISWAP_ROUTER), IChainlinkAggregator(B.SEQUENCER_UPTIME), 100
        );
        vm.startPrank(admin);
        swapper.setFeed(B.WETH, IChainlinkAggregator(B.FEED_ETH_USD), 25 hours);
        swapper.setFeed(B.CBBTC, IChainlinkAggregator(B.FEED_CBBTC_USD), 25 hours);
        swapper.setRoute(B.WETH, B.CBBTC, abi.encodePacked(B.WETH, uint24(500), B.CBBTC));
        swapper.setRoute(B.CBBTC, B.WETH, abi.encodePacked(B.CBBTC, uint24(500), B.WETH));
        vm.stopPrank();

        vault = new TurboVault(
            TurboVault.Config({
                weth: WETH,
                cbbtc: CBBTC,
                pool: POOL,
                positionManager: NPM,
                swapper: swapper,
                admin: admin,
                guardian: guardian,
                keeper: keeper,
                feeRecipient: treasury,
                performanceFee: 1_000,
                halfWidthTicks: 800
            })
        );
        // Start from a pool price that matches Chainlink exactly.
        _syncOracleToPool();
    }

    // --- helpers ---------------------------------------------------------

    function _deposit(address user, uint256 amount) internal returns (uint256 shares) {
        vm.deal(user, amount);
        vm.prank(user);
        shares = vault.depositETH{value: amount}(user);
    }

    function _rebalance() internal {
        vm.prank(keeper);
        vault.rebalance();
    }

    function _poolSqrt() internal view returns (uint160 sqrtP) {
        (sqrtP,,,,,,) = POOL.slot0();
    }

    /// Move the pool price by `bps` (negative = ETH gets cheaper in BTC) with a price-limited swap.
    function _movePool(int256 bps) internal {
        uint256 factor = Math.sqrt(uint256(10_000 + bps) * 1e14); // sqrt((1+bps/1e4)) * 1e9
        uint160 target = uint160(uint256(_poolSqrt()) * factor / 1e9);
        bool zeroForOne = bps < 0; // selling WETH lowers the price
        address tokenIn = zeroForOne ? B.WETH : B.CBBTC;
        deal(tokenIn, trader, zeroForOne ? 100_000 ether : 10_000e8);
        vm.startPrank(trader);
        IERC20(tokenIn).approve(B.UNISWAP_ROUTER, type(uint256).max);
        ISwapRouter02Single(B.UNISWAP_ROUTER).exactInputSingle(
            ISwapRouter02Single.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: zeroForOne ? B.CBBTC : B.WETH,
                fee: 500,
                recipient: trader,
                amountIn: zeroForOne ? 100_000 ether : 10_000e8,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: target
            })
        );
        vm.stopPrank();
    }

    /// Make Chainlink agree with the pool (a real market move instead of a manipulation).
    function _syncOracleToPool() internal {
        uint256 sqrtP = _poolSqrt();
        uint256 satsPerEth = Math.mulDiv(sqrtP * sqrtP, 1e18, 2 ** 192);
        int256 btcUsd = int256(uint256(ethUsd) * 1e8 / satsPerEth);
        _mockFeed(B.FEED_CBBTC_USD, btcUsd);
        _mockFeed(B.FEED_ETH_USD, ethUsd);
    }

    function _mockFeed(address feed, int256 price) internal {
        vm.mockCall(
            feed,
            abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
            abi.encode(uint80(1), price, block.timestamp, block.timestamp, uint80(1))
        );
    }

    /// Trading volume that returns the price to where it was, so in-range LPs earn fees.
    function _generateVolume(uint256 rounds) internal {
        deal(B.WETH, trader, 1_000 ether);
        vm.startPrank(trader);
        WETH.approve(B.UNISWAP_ROUTER, type(uint256).max);
        CBBTC.approve(B.UNISWAP_ROUTER, type(uint256).max);
        for (uint256 i; i < rounds; i++) {
            uint256 btc = ISwapRouter02Single(B.UNISWAP_ROUTER).exactInputSingle(
                ISwapRouter02Single.ExactInputSingleParams(B.WETH, B.CBBTC, 500, trader, 50 ether, 0, 0)
            );
            ISwapRouter02Single(B.UNISWAP_ROUTER).exactInputSingle(
                ISwapRouter02Single.ExactInputSingleParams(B.CBBTC, B.WETH, 500, trader, btc, 0, 0)
            );
        }
        vm.stopPrank();
    }

    // --- math ------------------------------------------------------------

    function test_Fork_TickMathMatchesPool() public view {
        (uint160 sqrtP, int24 tick,,,,,) = POOL.slot0();
        assertLe(TickMath.getSqrtRatioAtTick(tick), sqrtP);
        assertGt(TickMath.getSqrtRatioAtTick(tick + 1), sqrtP);
        assertEq(TickMath.getSqrtRatioAtTick(0), 2 ** 96);
    }

    // --- deposits & position -----------------------------------------------

    function test_Fork_DepositIsIdleUntilKeeperRebalances() public {
        uint256 shares = _deposit(alice, 10 ether);
        assertGt(shares, 0);
        assertEq(WETH.balanceOf(address(vault)), 10 ether);
        assertApproxEqAbs(vault.totalAssets(), 10 ether, 1);
        assertEq(vault.principalOf(alice), 10 ether);

        _rebalance();
        assertTrue(vault.inRange());
        assertGt(vault.positionId(), 0);
        // Swapping half into cbBTC costs ~0.05 % pool fee plus a little price impact.
        assertApproxEqRel(vault.totalAssets(), 10 ether, 0.003e18, "value kept after opening the position");
        uint256 idle0 = WETH.balanceOf(address(vault));
        uint256 idle1InEth = swapper.quote(B.CBBTC, B.WETH, CBBTC.balanceOf(address(vault)));
        assertLt(idle0 + idle1InEth, 0.05 ether, "almost everything is in the position");
    }

    function test_Fork_FeesBecomeBitcoin() public {
        _deposit(alice, 10 ether);
        _rebalance();
        _generateVolume(10);
        _syncOracleToPool();

        vm.prank(alice);
        (uint256 btcOut,) = vault.claim(alice, true);
        assertGt(btcOut, 0, "earned cbBTC from trading fees");
        assertEq(CBBTC.balanceOf(alice), btcOut);
        assertGt(WETH.balanceOf(treasury) + CBBTC.balanceOf(treasury), 0, "performance fee");
        emit log_named_decimal_uint("alice fees in cbBTC", btcOut, 8);
    }

    /// A WETH fee worth less than one sat must stay credited instead of being swapped into nothing.
    function test_Fork_DustFeesStayCredited() public {
        _deposit(alice, 0.01 ether);
        _rebalance();
        _generateVolume(1);
        _syncOracleToPool();

        vm.prank(alice);
        (uint256 btcOut,) = vault.claim(alice, true);
        (uint256 owed0,) = vault.claimable(alice);
        if (btcOut == 0) assertGt(owed0, 0, "dust kept for later");
        else assertEq(owed0, 0);
    }

    function test_Fork_LateDepositorGetsNoEarlierFees() public {
        _deposit(alice, 10 ether);
        _rebalance();
        _generateVolume(10);
        _syncOracleToPool();
        _deposit(bob, 10 ether); // collects alice's fees first

        (uint256 bob0, uint256 bob1) = vault.claimable(bob);
        assertEq(bob0 + bob1, 0);
        (uint256 alice0, uint256 alice1) = vault.claimable(alice);
        assertGt(alice0 + alice1, 0);
    }

    function test_Fork_WithdrawReturnsEth() public {
        uint256 shares = _deposit(alice, 10 ether);
        _rebalance();

        vm.prank(alice);
        uint256 out = vault.withdrawETH(shares, alice, alice, 9.9 ether);
        assertApproxEqRel(out, 10 ether, 0.006e18, "two swaps worth of costs at most");
        assertEq(alice.balance, out);
        assertEq(vault.principalOf(alice), 0);
        assertEq(vault.totalSupply(), 0);
        emit log_named_decimal_uint("ETH back from 10 ETH", out, 18);
    }

    // --- market moves & impermanent loss -----------------------------------

    function test_Fork_PriceLeavesRangeShowsLossAndRebalanceRecenters() public {
        _deposit(alice, 10 ether);
        _rebalance();
        uint256 before = vault.totalAssets();
        uint256 btcPerEthBefore = swapper.quote(B.WETH, B.CBBTC, 1 ether);

        // ETH falls 15 % against BTC (a real move: Chainlink follows).
        _movePool(-1500);
        _syncOracleToPool();
        assertFalse(vault.inRange(), "price left the range");
        uint256 afterMove = vault.totalAssets();

        // Simply holding half ETH, half BTC: the BTC half is now worth more ETH.
        uint256 btcPerEthAfter = swapper.quote(B.WETH, B.CBBTC, 1 ether);
        uint256 holdValue = before / 2 + (before / 2) * btcPerEthBefore / btcPerEthAfter;
        emit log_named_decimal_uint("value in ETH before", before, 18);
        emit log_named_decimal_uint("vault value after ETH -15% vs BTC", afterMove, 18);
        emit log_named_decimal_uint("value if simply held 50/50", holdValue, 18);
        emit log_named_decimal_uint("impermanent loss (%)", (holdValue - afterMove) * 100e18 / holdValue, 18);
        // On the way down the position sold its BTC for ETH, so it is now all ETH: worth more ETH
        // than before, but clearly less than having held.
        assertGt(afterMove, before);
        assertLt(afterMove, holdValue, "impermanent loss vs. holding");

        _rebalance();
        assertTrue(vault.inRange(), "re-centered");
    }

    // --- protections -------------------------------------------------------

    function test_Fork_ManipulatedPoolBlocksWithdrawAndRebalance() public {
        uint256 shares = _deposit(alice, 10 ether);
        _rebalance();

        _movePool(-300); // pool moved 3 %, Chainlink did not
        vm.prank(alice);
        vm.expectPartialRevert(TurboVault.PriceDeviation.selector);
        vault.withdrawETH(shares, alice, alice, 0);

        vm.prank(keeper);
        vm.expectPartialRevert(TurboVault.PriceDeviation.selector);
        vault.rebalance();
    }

    function test_Fork_EmergencyExitThenWithdraw() public {
        uint256 shares = _deposit(alice, 10 ether);
        _rebalance();

        vm.prank(guardian);
        vault.emergencyExit();
        assertTrue(vault.paused());
        assertEq(vault.positionId(), 0);

        vm.prank(alice);
        uint256 out = vault.withdrawETH(shares, alice, alice, 0);
        assertApproxEqRel(out, 10 ether, 0.006e18);
    }

    function test_Fork_OnlyKeeperRebalances() public {
        _deposit(alice, 1 ether);
        bytes32 role = vault.KEEPER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vault.rebalance();
    }

    function test_Fork_DepositCaps() public {
        vm.prank(admin);
        vault.setDepositCaps(0.5 ether, 0.2 ether);
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TurboVault.ExceedsDepositCap.selector, 0.3 ether, 0.2 ether));
        vault.depositETH{value: 0.3 ether}(alice);
    }

    function test_Fork_DeployIdleAddsNewDeposits() public {
        _deposit(alice, 5 ether);
        _rebalance();
        _deposit(bob, 5 ether);
        assertGt(WETH.balanceOf(address(vault)), 4.9 ether, "bob's deposit idle");

        vm.prank(keeper);
        vault.deployIdle();
        assertLt(WETH.balanceOf(address(vault)), 0.2 ether, "deployed");
        assertApproxEqRel(vault.totalAssets(), 10 ether, 0.005e18);
    }

    function test_Fork_TransferMovesPrincipalAndFees() public {
        uint256 shares = _deposit(alice, 10 ether);
        _rebalance();
        _generateVolume(5);
        _syncOracleToPool();

        vm.prank(alice);
        vault.transfer(bob, shares / 2);
        assertApproxEqAbs(vault.principalOf(alice), 5 ether, 1);
        assertApproxEqAbs(vault.principalOf(bob), 5 ether, 1);
        (uint256 bob0, uint256 bob1) = vault.claimable(bob);
        assertEq(bob0 + bob1, 0, "fees earned before the transfer stay with alice");
    }
}
