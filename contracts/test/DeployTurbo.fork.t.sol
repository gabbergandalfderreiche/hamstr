// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";

import {Deploy} from "../script/Deploy.s.sol";
import {DeployTurbo} from "../script/DeployTurbo.s.sol";
import {TurboVault} from "../src/TurboVault.sol";
import {OracleUniswapSwapper} from "../src/swappers/OracleUniswapSwapper.sol";

/// @notice Runs Deploy + DeployTurbo on a Base fork and checks the Turbo vault's permissions.
contract DeployTurboForkTest is Test {
    address multisig = makeAddr("hamstr-safe");
    address keeper = makeAddr("hamstr-bot");
    address treasury = makeAddr("hamstr-fees");

    Deploy.Deployment base;
    TurboVault vault;
    OracleUniswapSwapper swapper;
    DeployTurbo turboScript;

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
        vm.setEnv("MULTISIG", vm.toString(multisig));
        vm.setEnv("KEEPER", vm.toString(keeper));
        vm.setEnv("TREASURY", vm.toString(treasury));

        Deploy script = new Deploy();
        base = script.deploy(script.params(), address(script));

        turboScript = new DeployTurbo();
        DeployTurbo.Params memory p = DeployTurbo.Params({
            timelock: address(base.timelock),
            multisig: multisig,
            keeper: keeper,
            treasury: treasury,
            cap: 0.5 ether,
            userCap: 0.2 ether,
            halfWidthTicks: 800,
            performanceFee: 1_000
        });
        (vault, swapper) = turboScript.deploy(p, address(turboScript));
    }

    function test_TurboRolesAndLimits() public view {
        assertTrue(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), address(base.timelock)));
        assertFalse(vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), address(turboScript)));
        assertTrue(vault.hasRole(vault.GUARDIAN_ROLE(), multisig));
        assertTrue(vault.hasRole(vault.KEEPER_ROLE(), keeper));
        assertEq(swapper.owner(), address(base.timelock));
        assertEq(vault.depositCap(), 0.5 ether);
        assertEq(vault.userDepositCap(), 0.2 ether);
        assertEq(vault.halfWidthTicks(), 800);
        assertEq(vault.feeRecipient(), treasury);
        (, uint32 btcAge) = swapper.feeds(0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf);
        assertEq(btcAge, 1 hours);
    }

    function test_TurboWorksEndToEnd() public {
        address user = makeAddr("turbo-deploy-user");
        vm.deal(user, 0.2 ether);
        vm.prank(user);
        uint256 shares = vault.depositETH{value: 0.2 ether}(user);

        vm.prank(keeper);
        vault.rebalance();
        assertTrue(vault.inRange());

        vm.prank(user);
        uint256 out = vault.withdrawETH(shares, user, user, 0.198 ether);
        assertApproxEqRel(out, 0.2 ether, 0.006e18);
    }
}
