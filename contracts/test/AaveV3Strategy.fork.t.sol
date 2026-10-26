// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {YieldVault} from "../src/YieldVault.sol";
import {AaveV3Strategy} from "../src/strategies/AaveV3Strategy.sol";
import {IAaveV3AToken} from "../src/interfaces/IAaveV3.sol";
import {BaseAddresses} from "../script/BaseAddresses.sol";

/// @notice Runs against a copy of Base mainnet with the real Aave V3 market.
/// Uses BASE_RPC_URL if set, otherwise Base's public RPC.
contract AaveV3StrategyForkTest is Test {
    IERC20 weth = IERC20(BaseAddresses.WETH);
    YieldVault vault;
    AaveV3Strategy strategy;

    address admin = makeAddr("admin");
    address guardian = makeAddr("guardian");
    address treasury = makeAddr("treasury");
    // Not makeAddr("alice"): that well-known address has an EIP-7702 delegation on Base mainnet that
    // forwards incoming ETH, which breaks balance checks on a fork.
    address alice = makeAddr("yieldvault-fork-user");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));

        vault = new YieldVault(weth, "Vault ETH", "vETH", admin, guardian, treasury, 1_000, 0, BaseAddresses.WETH);
        strategy = new AaveV3Strategy(address(vault), BaseAddresses.WETH, IAaveV3AToken(BaseAddresses.AAVE_A_WETH));
        vm.prank(admin);
        vault.setStrategy(strategy);
    }

    function test_Fork_StrategyWiredToRealAave() public view {
        assertEq(address(strategy.pool()), BaseAddresses.AAVE_POOL);
        assertEq(address(strategy.aToken()), BaseAddresses.AAVE_A_WETH);
    }

    function test_Fork_EarnsYieldAndUserCanExit() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        uint256 shares = vault.depositETH{value: 10 ether}(alice);

        assertApproxEqAbs(vault.totalAssets(), 10 ether, 2, "all supplied to Aave");
        assertApproxEqAbs(IERC20(BaseAddresses.AAVE_A_WETH).balanceOf(address(strategy)), 10 ether, 2);

        vm.warp(block.timestamp + 30 days);
        uint256 grown = vault.totalAssets();
        assertGt(grown, 10 ether, "aToken balance grew");
        emit log_named_decimal_uint("Assets after 30 days", grown, 18);

        vault.harvest();
        assertGt(vault.balanceOf(treasury), 0, "performance fee taken on profit");

        vm.prank(alice);
        uint256 out = vault.redeemETH(shares, alice, alice);
        assertEq(alice.balance, out);
        assertGt(out, 10 ether, "alice exits with profit");
        emit log_named_decimal_uint("Alice receives", out, 18);
    }

    function test_Fork_EmergencyWithdrawFromAave() public {
        deal(BaseAddresses.WETH, alice, 5 ether);
        vm.startPrank(alice);
        weth.approve(address(vault), 5 ether);
        uint256 shares = vault.deposit(5 ether, alice);
        vm.stopPrank();

        vm.prank(guardian);
        vault.emergencyWithdraw();
        assertEq(IERC20(BaseAddresses.AAVE_A_WETH).balanceOf(address(strategy)), 0);
        assertGe(weth.balanceOf(address(vault)), 5 ether - 2);

        vm.prank(alice);
        vault.redeem(shares, alice, alice);
        assertApproxEqAbs(weth.balanceOf(alice), 5 ether, 2);
    }
}
