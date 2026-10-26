// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {BtcYieldVault} from "../src/BtcYieldVault.sol";
import {ISwapper} from "../src/interfaces/ISwapper.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockStrategy} from "./mocks/MockStrategy.sol";
import {MockSwapper} from "./mocks/MockSwapper.sol";

contract BtcYieldVaultTest is Test {
    MockERC20 usdc;
    MockERC20 cbbtc;
    BtcYieldVault vault;
    MockStrategy strategy;
    MockSwapper swapper;

    address admin = makeAddr("admin");
    address guardian = makeAddr("guardian");
    address keeper = makeAddr("keeper");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant USDC = 1e6;
    uint256 constant FEE = 1_000; // 10%
    /// Yield units the vault always leaves unrealized as a rounding cushion.
    uint256 constant BUFFER = 10;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        cbbtc = new MockERC20("Coinbase Wrapped BTC", "cbBTC", 8);
        // 1 USDC -> 1000 sats (BTC at 100k USD)
        swapper = new MockSwapper(1000, USDC);
        vault = _newVault(IERC20(address(usdc)), address(0));
        strategy = new MockStrategy(address(vault), address(usdc));

        vm.startPrank(admin);
        vault.setStrategy(strategy);
        vault.setSwapper(swapper);
        vm.stopPrank();
    }

    function _newVault(IERC20 asset_, address weth_) internal returns (BtcYieldVault) {
        return new BtcYieldVault(
            BtcYieldVault.Config({
                asset: asset_,
                rewardToken: IERC20(address(cbbtc)),
                name: "Hamstr Dollar",
                symbol: "hamUSDC",
                admin: admin,
                guardian: guardian,
                keeper: keeper,
                feeRecipient: treasury,
                performanceFee: FEE,
                weth: weth_
            })
        );
    }

    // --- helpers ---------------------------------------------------------

    function _deposit(address user, uint256 amount) internal {
        usdc.mint(user, amount);
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.deposit(amount, user);
        vm.stopPrank();
    }

    function _withdrawAll(address user) internal returns (uint256) {
        uint256 shares = vault.balanceOf(user);
        vm.prank(user);
        return vault.withdraw(shares, user, user);
    }

    function _profit(uint256 amount) internal {
        usdc.mint(address(strategy), amount);
    }

    function _harvest() internal returns (uint256) {
        vm.prank(keeper);
        return vault.harvest(0);
    }

    function _claim(address user) internal returns (uint256) {
        vm.prank(user);
        return vault.claim(user);
    }

    /// Sats a user should get for `usdcYield` of their yield, after the 10% fee.
    function _sats(uint256 usdcYield) internal pure returns (uint256) {
        return usdcYield * 1000 / USDC * 9 / 10;
    }

    // --- principal -------------------------------------------------------

    function test_PrincipalIsReturnedExactly() public {
        _deposit(alice, 1_000 * USDC);
        assertEq(vault.balanceOf(alice), 1_000 * USDC, "shares 1:1");
        assertEq(usdc.balanceOf(address(strategy)), 1_000 * USDC, "invested");

        _profit(100 * USDC);
        _harvest();

        assertEq(_withdrawAll(alice), 1_000 * USDC, "exact principal, yield went to BTC");
        assertEq(usdc.balanceOf(alice), 1_000 * USDC);
    }

    function test_NoRewardsWithoutYield() public {
        _deposit(alice, 1_000 * USDC);
        vm.prank(keeper);
        vm.expectRevert(BtcYieldVault.NothingToHarvest.selector);
        vault.harvest(0);
    }

    // --- yield distribution ----------------------------------------------

    function test_YieldBecomesBitcoinMinusFee() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);

        uint256 out = _harvest();
        assertEq(out, (100 * USDC - BUFFER) * 1000 / USDC, "100 USDC -> ~100k sats");
        assertEq(cbbtc.balanceOf(treasury), out / 10, "10% fee");
        assertApproxEqAbs(_claim(alice), out - out / 10, 1);
    }

    function test_YieldIsSharedProRata() public {
        _deposit(alice, 3_000 * USDC);
        _deposit(bob, 1_000 * USDC);
        _profit(40 * USDC);
        _harvest();

        assertApproxEqAbs(_claim(alice), _sats(30 * USDC), 1);
        assertApproxEqAbs(_claim(bob), _sats(10 * USDC), 1);
    }

    /// Depositing right before a harvest must not capture yield earned by others.
    function test_LateDepositorGetsNoEarlierYield() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        _deposit(bob, 1_000_000 * USDC); // whale joins just before the harvest
        _harvest();

        assertApproxEqAbs(_claim(alice), _sats(100 * USDC), 1);
        assertEq(_claim(bob), 0);
    }

    /// Leaving mid-epoch keeps the credit earned so far; it converts at the next harvest.
    function test_ExitMidEpochKeepsEarnedCredit() public {
        _deposit(alice, 1_000 * USDC);
        _deposit(bob, 1_000 * USDC);
        _profit(100 * USDC); // 50 each
        assertEq(_withdrawAll(bob), 1_000 * USDC);
        _profit(100 * USDC); // all alice
        _harvest();

        assertApproxEqAbs(_claim(alice), _sats(150 * USDC), 1);
        assertApproxEqAbs(_claim(bob), _sats(50 * USDC), 1, "bob claims with zero shares");
    }

    /// An idle user across several harvests with different BTC prices gets each epoch at its rate.
    function test_MultipleEpochsWithDifferentRates() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        _harvest(); // epoch 0: 1000 sats per USDC -> alice 90k

        swapper.setRate(500, USDC); // BTC doubled
        _deposit(bob, 1_000 * USDC);
        _profit(100 * USDC); // 50 alice, 50 bob
        _harvest(); // epoch 1: 500 sats per USDC

        _profit(200 * USDC); // 100 each, epoch 2 at the same rate
        _harvest();

        uint256 aliceExpected = _sats(100 * USDC) + _sats(50 * USDC) / 2 + _sats(100 * USDC) / 2;
        uint256 bobExpected = _sats(50 * USDC) / 2 + _sats(100 * USDC) / 2;
        assertApproxEqAbs(_claim(alice), aliceExpected, 2);
        assertApproxEqAbs(_claim(bob), bobExpected, 2);
    }

    function test_ShareTransferSplitsYieldFairly() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC); // all alice

        vm.prank(alice);
        vault.transfer(bob, 500 * USDC);
        _profit(100 * USDC); // 50 / 50
        _harvest();

        assertApproxEqAbs(_claim(alice), _sats(150 * USDC), 1);
        assertApproxEqAbs(_claim(bob), _sats(50 * USDC), 1);
        assertEq(_withdrawAll(bob), 500 * USDC);
    }

    function test_YieldWhileEmptyGoesToTreasury() public {
        _profit(10 * USDC); // donation / leftover while nobody is in
        _deposit(alice, 1_000 * USDC);
        _harvest();

        assertEq(cbbtc.balanceOf(treasury), (10 * USDC - BUFFER) * 1000 / USDC, "all of it");
        assertEq(_claim(alice), 0);
    }

    function test_PositionViewMatchesClaims() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);

        (uint256 claimable, uint256 pending) = vault.positionOf(alice);
        assertEq(claimable, 0);
        assertEq(pending, 100 * USDC - BUFFER, "unrealized yield shows as pending");

        _harvest();
        (claimable, pending) = vault.positionOf(alice);
        assertEq(pending, 0);
        assertEq(claimable, _claim(alice));
    }

    // --- losses ----------------------------------------------------------

    function test_LossReducesWithdrawalsProRata() public {
        _deposit(alice, 1_000 * USDC);
        _deposit(bob, 1_000 * USDC);
        usdc.burn(address(strategy), 200 * USDC); // strategy loses 10%

        assertEq(vault.previewWithdraw(1_000 * USDC), 900 * USDC);
        assertEq(_withdrawAll(alice), 900 * USDC);
        assertEq(_withdrawAll(bob), 900 * USDC);
    }

    function test_HarvestBlockedDuringDeficit() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        _deposit(bob, 1_000 * USDC); // realizes alice's 100 as pending
        usdc.burn(address(strategy), 150 * USDC);

        vm.prank(keeper);
        vm.expectRevert(BtcYieldVault.Deficit.selector);
        vault.harvest(0);
    }

    // --- keeper, swaps & roles -------------------------------------------

    function test_HarvestRespectsMinOut() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        vm.prank(keeper);
        vm.expectRevert("slippage");
        vault.harvest(100_001);
    }

    function test_MinHarvestSkipsDust() public {
        vm.prank(admin);
        vault.setMinHarvest(10 * USDC);
        _deposit(alice, 1_000 * USDC);
        _profit(1 * USDC);
        vm.prank(keeper);
        vm.expectRevert(BtcYieldVault.NothingToHarvest.selector);
        vault.harvest(0);
    }

    function test_OnlyKeeperCanHarvest() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        bytes32 role = vault.KEEPER_ROLE();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role));
        vault.harvest(0);
    }

    function test_OnlyAdminCanChangeSettings() public {
        bytes32 role = vault.DEFAULT_ADMIN_ROLE();
        bytes memory err = abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, role);
        vm.startPrank(alice);
        vm.expectRevert(err);
        vault.setSwapper(ISwapper(alice));
        vm.expectRevert(err);
        vault.setPerformanceFee(0);
        vm.expectRevert(err);
        vault.setDepositCaps(0, 0);
        vm.stopPrank();
    }

    function test_FeeIsCapped() public {
        vm.prank(admin);
        vm.expectRevert(BtcYieldVault.FeeTooHigh.selector);
        vault.setPerformanceFee(2_001);
    }

    function test_PauseBlocksDepositsButNotWithdrawOrClaim() public {
        _deposit(alice, 1_000 * USDC);
        _profit(100 * USDC);
        _harvest();

        vm.prank(guardian);
        vault.emergencyWithdraw();
        assertEq(usdc.balanceOf(address(vault)), 1_000 * USDC + BUFFER, "funds back in the vault");

        usdc.mint(bob, 1 * USDC);
        vm.startPrank(bob);
        usdc.approve(address(vault), 1 * USDC);
        vm.expectRevert(abi.encodeWithSelector(BtcYieldVault.ExceedsDepositCap.selector, 1 * USDC, 0));
        vault.deposit(1 * USDC, bob);
        vm.stopPrank();

        assertApproxEqAbs(_claim(alice), _sats(100 * USDC), 1);
        assertEq(_withdrawAll(alice), 1_000 * USDC);
    }

    function test_DepositCaps() public {
        vm.prank(admin);
        vault.setDepositCaps(1_500 * USDC, 1_000 * USDC);
        _deposit(alice, 1_000 * USDC);
        assertEq(vault.maxDeposit(alice), 0);
        assertEq(vault.maxDeposit(bob), 500 * USDC);
    }

    function test_WithdrawForOtherNeedsAllowance() public {
        _deposit(alice, 1_000 * USDC);
        vm.prank(bob);
        vm.expectRevert();
        vault.withdraw(1_000 * USDC, bob, alice);
    }

    // --- native ETH ------------------------------------------------------

    function test_NativeETHDepositAndWithdraw() public {
        MockWETH weth = new MockWETH();
        BtcYieldVault ethVault = _newVault(IERC20(address(weth)), address(weth));
        MockStrategy ethStrategy = new MockStrategy(address(ethVault), address(weth));
        vm.startPrank(admin);
        ethVault.setStrategy(ethStrategy);
        ethVault.setSwapper(new MockSwapper(3, 100 * 1e10)); // 1 ETH -> 0.03 BTC
        vm.stopPrank();

        vm.deal(alice, 2 ether);
        vm.prank(alice);
        ethVault.depositETH{value: 2 ether}(alice);
        assertEq(ethVault.balanceOf(alice), 2 ether, "wrapped ETH is not counted as yield");

        weth.mint(address(ethStrategy), 0.1 ether);
        vm.prank(keeper);
        ethVault.harvest(0);

        vm.prank(alice);
        ethVault.withdrawETH(2 ether, alice, alice);
        assertEq(alice.balance, 2 ether);
        vm.prank(alice);
        assertApproxEqAbs(ethVault.claim(alice), 0.1 ether * 3 / (100 * 1e10) * 9 / 10, 1);
    }

    // --- fuzz ------------------------------------------------------------

    /// Random amounts over two epochs: principal always returns exactly and no one can claim more
    /// rewards than the vault received for users.
    function testFuzz_AccountingIsSolvent(uint64 a, uint64 b, uint64 y1, uint64 y2, uint64 y3) public {
        uint256 depA = bound(uint256(a), 1 * USDC, 10_000_000 * USDC);
        uint256 depB = bound(uint256(b), 1 * USDC, 10_000_000 * USDC);
        uint256 yield1 = bound(uint256(y1), 1 * USDC, 1_000_000 * USDC);
        uint256 yield2 = bound(uint256(y2), 1 * USDC, 1_000_000 * USDC);
        uint256 yield3 = bound(uint256(y3), 1 * USDC, 1_000_000 * USDC);

        _deposit(alice, depA);
        _profit(yield1);
        _deposit(bob, depB);
        _harvest();
        _profit(yield2);
        assertEq(_withdrawAll(alice), depA);
        swapper.setRate(700, USDC);
        _profit(yield3);
        _harvest();
        assertEq(_withdrawAll(bob), depB);

        uint256 claimedA = _claim(alice);
        uint256 claimedB = _claim(bob);
        uint256 userRewards = (yield1 * 1000 + yield2 * 700 + yield3 * 700) / USDC;
        userRewards -= userRewards / 10 + 2; // fee and rounding

        assertLe(cbbtc.balanceOf(address(vault)), 10, "only rounding dust left");
        // A few sats of rounding per epoch; relative 0.1% for large amounts.
        assertApproxEqAbs(claimedA + claimedB, userRewards, userRewards / 1000 + 5, "almost everything distributed");

        // Exact split: alice owns yield1 + her share of yield2; bob his share of yield2 + all of yield3.
        uint256 aliceYield2 = yield2 * depA / (depA + depB);
        uint256 expectedA = (yield1 * 1000 + aliceYield2 * 700) / USDC * 9 / 10;
        assertApproxEqAbs(claimedA, expectedA, expectedA / 1000 + 3);
    }
}
