// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {BtcYieldVault} from "../src/BtcYieldVault.sol";
import {IChainlinkAggregator} from "../src/interfaces/IExternal.sol";
import {BaseAddresses as B} from "../script/BaseAddresses.sol";

/// @notice Runs the real deploy script on a Base fork and checks the resulting permissions.
contract DeployForkTest is Test {
    Deploy script;
    Deploy.Params p;
    Deploy.Deployment d;

    address multisig = makeAddr("hamstr-safe");
    address keeper = makeAddr("hamstr-bot");
    address treasury = makeAddr("hamstr-fees");
    address user = makeAddr("hamstr-deploy-user");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        vm.setEnv("MULTISIG", vm.toString(multisig));
        vm.setEnv("KEEPER", vm.toString(keeper));
        vm.setEnv("TREASURY", vm.toString(treasury));

        script = new Deploy();
        p = script.params();
        d = script.deploy(p, address(script));
    }

    function test_DefaultBetaParameters() public view {
        assertEq(d.timelock.getMinDelay(), 2 days);
        assertEq(d.usdcVault.depositCap(), 50_000e6);
        assertEq(d.usdcVault.userDepositCap(), 5_000e6);
        assertEq(d.ethVault.depositCap(), 15 ether);
        assertEq(d.ethVault.userDepositCap(), 1.5 ether);
        assertEq(d.usdcVault.performanceFee(), 1_000);
        assertEq(d.swapper.maxSlippageBps(), 100);
        assertEq(d.usdcVault.feeRecipient(), treasury);
    }

    function test_DeployerKeepsNoRights() public {
        BtcYieldVault v = d.usdcVault;
        assertFalse(v.hasRole(v.DEFAULT_ADMIN_ROLE(), address(script)));
        assertFalse(v.hasRole(v.GUARDIAN_ROLE(), address(script)));
        assertFalse(v.hasRole(v.KEEPER_ROLE(), address(script)));
        assertEq(d.swapper.owner(), address(d.timelock));

        vm.prank(address(script));
        vm.expectRevert(
            abi.encodeWithSelector(
                IAccessControl.AccessControlUnauthorizedAccount.selector, address(script), bytes32(0)
            )
        );
        v.setDepositCaps(type(uint256).max, type(uint256).max);
    }

    function test_MultisigCannotSkipTheTimelock() public {
        vm.prank(multisig);
        vm.expectRevert();
        d.usdcVault.setPerformanceFee(2_000);
    }

    function test_ChangeGoesThroughTimelockDelay() public {
        bytes memory call = abi.encodeCall(BtcYieldVault.setDepositCaps, (100_000e6, 10_000e6));
        TimelockController t = d.timelock;

        vm.prank(multisig);
        t.schedule(address(d.usdcVault), 0, call, bytes32(0), bytes32(0), 2 days);

        vm.prank(multisig);
        vm.expectRevert(); // too early
        t.execute(address(d.usdcVault), 0, call, bytes32(0), bytes32(0));

        vm.warp(block.timestamp + 2 days);
        vm.prank(multisig);
        t.execute(address(d.usdcVault), 0, call, bytes32(0), bytes32(0));
        assertEq(d.usdcVault.depositCap(), 100_000e6);
    }

    function test_GuardianCanPauseImmediately() public {
        vm.prank(multisig);
        d.usdcVault.pause();
        assertTrue(d.usdcVault.paused());
    }

    function test_UserCapIsEnforced() public {
        deal(B.USDC, user, 6_000e6);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(d.usdcVault), 6_000e6);
        vm.expectRevert(abi.encodeWithSelector(BtcYieldVault.ExceedsDepositCap.selector, 6_000e6, 5_000e6));
        d.usdcVault.deposit(6_000e6, user);
        vm.stopPrank();
    }

    function test_FullFlowOnDeployedContracts() public {
        deal(B.USDC, user, 5_000e6);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(d.usdcVault), 5_000e6);
        d.usdcVault.deposit(5_000e6, user);
        vm.stopPrank();

        // Prices from before the time jump, replayed as fresh.
        address[3] memory feeds = [B.FEED_USDC_USD, B.FEED_ETH_USD, B.FEED_CBBTC_USD];
        int256[3] memory prices;
        for (uint256 i; i < 3; i++) {
            (, prices[i],,,) = IChainlinkAggregator(feeds[i]).latestRoundData();
        }
        vm.warp(block.timestamp + 90 days);
        for (uint256 i; i < 3; i++) {
            vm.mockCall(
                feeds[i],
                abi.encodeWithSelector(IChainlinkAggregator.latestRoundData.selector),
                abi.encode(uint80(1), prices[i], block.timestamp, block.timestamp, uint80(1))
            );
        }

        vm.prank(keeper);
        uint256 out = d.usdcVault.harvest(0);
        assertGt(out, 0);
        assertGt(IERC20(B.CBBTC).balanceOf(treasury), 0, "fee to treasury");

        vm.startPrank(user);
        assertGt(d.usdcVault.claim(user), 0);
        assertEq(d.usdcVault.withdraw(5_000e6, user, user), 5_000e6);
        vm.stopPrank();
    }
}
