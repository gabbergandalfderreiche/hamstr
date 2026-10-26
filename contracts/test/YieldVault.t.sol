// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import {YieldVault} from "../src/YieldVault.sol";
import {IStrategy} from "../src/interfaces/IStrategy.sol";
import {MockWETH} from "./mocks/MockWETH.sol";
import {MockStrategy} from "./mocks/MockStrategy.sol";

contract YieldVaultTest is Test {
    MockWETH weth;
    YieldVault vault;
    MockStrategy strategy;

    address admin = makeAddr("admin");
    address guardian = makeAddr("guardian");
    address treasury = makeAddr("treasury");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant PERF_FEE = 1_000; // 10%

    function setUp() public {
        weth = new MockWETH();
        vault = new YieldVault(
            IERC20(address(weth)), "Vault ETH", "vETH", admin, guardian, treasury, PERF_FEE, 0, address(weth)
        );
        strategy = new MockStrategy(address(vault), address(weth));
        vm.prank(admin);
        vault.setStrategy(strategy);
    }

    // --- helpers ---------------------------------------------------------

    function _deposit(address user, uint256 amount) internal returns (uint256 shares) {
        weth.mint(user, amount);
        vm.startPrank(user);
        weth.approve(address(vault), amount);
        shares = vault.deposit(amount, user);
        vm.stopPrank();
    }

    function _profit(uint256 amount) internal {
        weth.mint(address(strategy), amount);
    }

    function _loss(uint256 amount) internal {
        weth.burn(address(strategy), amount);
    }

    function _valueOf(address user) internal view returns (uint256) {
        return vault.convertToAssets(vault.balanceOf(user));
    }

    // --- basics ----------------------------------------------------------

    function test_DepositIsInvestedAndRedeemReturnsFunds() public {
        uint256 shares = _deposit(alice, 10 ether);

        assertEq(weth.balanceOf(address(strategy)), 10 ether, "deposit forwarded to strategy");
        assertEq(weth.balanceOf(address(vault)), 0, "nothing idle");
        assertEq(vault.totalAssets(), 10 ether);

        vm.prank(alice);
        uint256 assets = vault.redeem(shares, alice, alice);
        assertApproxEqAbs(assets, 10 ether, 1, "full amount back");
        assertApproxEqAbs(weth.balanceOf(alice), 10 ether, 1);
    }

    function test_ProfitIsSharedProRata() public {
        _deposit(alice, 30 ether);
        _deposit(bob, 10 ether);
        _profit(4 ether); // +10%

        vault.harvest();
        // 10% performance fee on 4 ETH profit = 0.4 ETH, users keep 3.6 ETH (alice 2.7, bob 0.9)
        assertApproxEqRel(_valueOf(alice), 32.7 ether, 1e12);
        assertApproxEqRel(_valueOf(bob), 10.9 ether, 1e12);
        assertApproxEqRel(_valueOf(treasury), 0.4 ether, 1e12);
    }

    // --- fees ------------------------------------------------------------

    function test_NoPerformanceFeeWithoutProfit() public {
        _deposit(alice, 10 ether);
        vm.warp(block.timestamp + 30 days);
        vault.harvest();
        assertEq(vault.balanceOf(treasury), 0);
    }

    function test_HighWaterMark_NoFeeOnRecoveringLosses() public {
        _deposit(alice, 100 ether);

        _profit(10 ether);
        vault.harvest();
        uint256 feeAfterFirstProfit = _valueOf(treasury);
        assertApproxEqRel(feeAfterFirstProfit, 1 ether, 1e12, "10% of 10 ETH");

        _loss(5 ether);
        vault.harvest();
        uint256 sharesAfterLoss = vault.balanceOf(treasury);

        _profit(5 ether); // only recovers the loss
        vault.harvest();
        assertEq(vault.balanceOf(treasury), sharesAfterLoss, "no fee on recovery");

        _profit(2 ether); // new profit above the previous high
        vault.harvest();
        uint256 newFeeShares = vault.balanceOf(treasury) - sharesAfterLoss;
        assertApproxEqRel(vault.convertToAssets(newFeeShares), 0.2 ether, 1e10, "fee only on the new 2 ETH");
    }

    function test_HarvestTwiceDoesNotDoubleCharge() public {
        _deposit(alice, 10 ether);
        _profit(1 ether);
        vault.harvest();
        uint256 shares = vault.balanceOf(treasury);
        vault.harvest();
        assertEq(vault.balanceOf(treasury), shares);
    }

    function test_ManagementFeeAccruesOverAYear() public {
        vm.prank(admin);
        vault.setFees(0, 100); // 1% per year, no performance fee

        _deposit(alice, 100 ether);
        vm.warp(block.timestamp + 365 days);
        vault.harvest();

        assertApproxEqRel(_valueOf(treasury), 1 ether, 1e12);
        assertApproxEqRel(_valueOf(alice), 99 ether, 1e12);
    }

    function test_FeesAreCappedByConstants() public {
        vm.startPrank(admin);
        vm.expectRevert(YieldVault.FeeTooHigh.selector);
        vault.setFees(2_001, 0);
        vm.expectRevert(YieldVault.FeeTooHigh.selector);
        vault.setFees(0, 201);
        vm.stopPrank();
    }

    function test_FeeChangeSettlesOldFeesFirst() public {
        _deposit(alice, 100 ether);
        _profit(10 ether);

        vm.prank(admin);
        vault.setFees(2_000, 0); // raising the fee must not apply to profit earned before
        assertApproxEqRel(_valueOf(treasury), 1 ether, 1e12);
    }

    // --- caps & pause ----------------------------------------------------

    function test_DepositCaps() public {
        vm.prank(admin);
        vault.setDepositCaps(15 ether, 10 ether);

        _deposit(alice, 10 ether);

        weth.mint(alice, 1 ether);
        vm.startPrank(alice);
        weth.approve(address(vault), 1 ether);
        vm.expectRevert(abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxDeposit.selector, alice, 1 ether, 0));
        vault.deposit(1 ether, alice);
        vm.stopPrank();

        _deposit(bob, 5 ether);
        assertEq(vault.maxDeposit(makeAddr("carol")), 0, "vault full");
    }

    function test_PauseBlocksDepositsButNotWithdrawals() public {
        uint256 shares = _deposit(alice, 10 ether);

        vm.prank(guardian);
        vault.pause();
        assertEq(vault.maxDeposit(bob), 0);

        weth.mint(bob, 1 ether);
        vm.startPrank(bob);
        weth.approve(address(vault), 1 ether);
        vm.expectRevert();
        vault.deposit(1 ether, bob);
        vm.stopPrank();

        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        assertApproxEqAbs(weth.balanceOf(alice), 10 ether, 1);
    }

    function test_EmergencyWithdrawPullsFundsAndUsersCanExit() public {
        uint256 shares = _deposit(alice, 10 ether);

        vm.prank(guardian);
        vault.emergencyWithdraw();

        assertTrue(vault.paused());
        assertEq(weth.balanceOf(address(strategy)), 0);
        assertEq(weth.balanceOf(address(vault)), 10 ether);

        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        assertApproxEqAbs(weth.balanceOf(alice), 10 ether, 1);
    }

    function test_DeployIdleAfterEmergency() public {
        _deposit(alice, 10 ether);
        vm.prank(guardian);
        vault.emergencyWithdraw();

        vm.startPrank(admin);
        vault.unpause();
        vault.deployIdle();
        vm.stopPrank();
        assertEq(weth.balanceOf(address(strategy)), 10 ether);
    }

    // --- access control --------------------------------------------------

    function test_OnlyAdminCanChangeSettings() public {
        bytes32 adminRole = vault.DEFAULT_ADMIN_ROLE();
        bytes memory err =
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, adminRole);

        vm.startPrank(alice);
        vm.expectRevert(err);
        vault.setFees(0, 0);
        vm.expectRevert(err);
        vault.setFeeRecipient(alice);
        vm.expectRevert(err);
        vault.setStrategy(IStrategy(address(0)));
        vm.expectRevert(err);
        vault.setDepositCaps(0, 0);
        vm.stopPrank();
    }

    function test_OnlyGuardianCanPause() public {
        bytes32 guardianRole = vault.GUARDIAN_ROLE();
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, alice, guardianRole)
        );
        vault.pause();
    }

    function test_StrategyMustBelongToVault() public {
        MockStrategy wrong = new MockStrategy(address(0xBEEF), address(weth));
        vm.prank(admin);
        vm.expectRevert(YieldVault.StrategyMismatch.selector);
        vault.setStrategy(wrong);
    }

    function test_StrategyMigrationMovesAllFunds() public {
        _deposit(alice, 10 ether);
        MockStrategy next = new MockStrategy(address(vault), address(weth));

        vm.prank(admin);
        vault.setStrategy(next);

        assertEq(weth.balanceOf(address(strategy)), 0);
        assertEq(weth.balanceOf(address(next)), 10 ether);
        assertEq(vault.totalAssets(), 10 ether);
    }

    // --- native ETH ------------------------------------------------------

    function test_DepositAndRedeemNativeETH() public {
        vm.deal(alice, 5 ether);
        vm.prank(alice);
        uint256 shares = vault.depositETH{value: 5 ether}(alice);

        assertEq(weth.balanceOf(address(strategy)), 5 ether);
        assertEq(alice.balance, 0);

        vm.prank(alice);
        uint256 assets = vault.redeemETH(shares, alice, alice);
        assertApproxEqAbs(assets, 5 ether, 1);
        assertApproxEqAbs(alice.balance, 5 ether, 1);
    }

    function test_DepositETHRespectsCaps() public {
        vm.prank(admin);
        vault.setDepositCaps(type(uint256).max, 1 ether);
        vm.deal(alice, 2 ether);
        vm.prank(alice);
        vm.expectRevert(
            abi.encodeWithSelector(ERC4626.ERC4626ExceededMaxDeposit.selector, alice, 2 ether, 1 ether)
        );
        vault.depositETH{value: 2 ether}(alice);
    }

    function test_RejectsStrayETH() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(vault).call{value: 1 ether}("");
        assertFalse(ok);
    }

    // --- security --------------------------------------------------------

    /// Classic attack: first depositor mints 1 wei of shares, then donates a lot to inflate the share
    /// price so the next depositor's shares round down to zero.
    function test_InflationAttackIsUneconomical() public {
        _deposit(bob, 1); // attacker
        weth.mint(address(strategy), 10 ether); // attacker "donation"

        _deposit(alice, 1 ether);
        assertGt(vault.balanceOf(alice), 0, "victim got shares");
        // Victim loses at most a tiny fraction; the attacker loses most of the donation.
        assertApproxEqRel(_valueOf(alice), 1 ether, 1e14);
    }

    function testFuzz_UsersNeverGetMoreThanTheyPutIn(uint96 a, uint96 b) public {
        uint256 amountA = bound(uint256(a), 1e6, 1e27);
        uint256 amountB = bound(uint256(b), 1e6, 1e27);

        uint256 sharesA = _deposit(alice, amountA);
        uint256 sharesB = _deposit(bob, amountB);

        vm.prank(alice);
        uint256 outA = vault.redeem(sharesA, alice, alice);
        vm.prank(bob);
        uint256 outB = vault.redeem(sharesB, bob, bob);

        assertLe(outA, amountA);
        assertLe(outB, amountB);
        assertApproxEqAbs(outA, amountA, 2);
        assertApproxEqAbs(outB, amountB, 2);
    }

    function testFuzz_FeeNeverExceedsConfiguredShare(uint96 deposit_, uint96 profit_) public {
        uint256 amount = bound(uint256(deposit_), 1 ether, 1e27);
        uint256 profit = bound(uint256(profit_), 1e9, amount);

        _deposit(alice, amount);
        _profit(profit);
        vault.harvest();

        uint256 expected = profit * PERF_FEE / 10_000;
        assertLe(_valueOf(treasury), expected + 1, "never more than the configured fee");
        // Price-per-share rounding can undercharge by about amount / 1e18 wei (in the users' favour).
        assertApproxEqAbs(_valueOf(treasury), expected, amount / 1e18 + 2);
    }
}
