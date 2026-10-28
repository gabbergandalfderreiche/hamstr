// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BtcYieldVault} from "../src/BtcYieldVault.sol";
import {AaveV3Strategy} from "../src/strategies/AaveV3Strategy.sol";
import {IAaveV3Pool, IAaveV3AToken} from "../src/interfaces/IAaveV3.sol";
import {BaseAddresses as B} from "../script/BaseAddresses.sol";

/// @notice Fresh vault, deposit, withdraw everything right away (the frontend's guided test run).
/// Guards against Aave's rounding making a full withdrawal revert: Aave reports the aToken balance a
/// wei below the principal, and the vault then asks Aave for exactly that balance.
/// Aave also rounds each supply and withdrawal by a wei or so against the user; on a fresh vault
/// without a yield buffer that dust comes out of principal, hence the `DUST` tolerance.
contract AaveRoundingForkTest is Test {
    uint256 constant DUST = 5;

    BtcYieldVault usdcVault;
    BtcYieldVault ethVault;

    address admin = makeAddr("hamstr-admin");
    address guardian = makeAddr("hamstr-guardian");
    address keeper = makeAddr("hamstr-keeper");
    address treasury = makeAddr("hamstr-treasury");
    // Avoid forge's well-known default names; some have EIP-7702 delegations on Base.
    address user = makeAddr("hamstr-rounding-user");

    function setUp() public {
        vm.createSelectFork(vm.envOr("BASE_RPC_URL", string("https://mainnet.base.org")));
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
        vm.prank(admin);
        v.setStrategy(s);
    }

    function _depositUsdc(uint256 amount) internal returns (uint256 shares) {
        deal(B.USDC, user, amount);
        vm.startPrank(user);
        IERC20(B.USDC).approve(address(usdcVault), amount);
        shares = usdcVault.deposit(amount, user);
        vm.stopPrank();
    }

    function _withdrawAllUsdc(uint256 shares) internal returns (uint256 out) {
        uint256 before = IERC20(B.USDC).balanceOf(user);
        vm.prank(user);
        out = usdcVault.withdraw(shares, user, user);
        assertEq(IERC20(B.USDC).balanceOf(user) - before, out, "user received what withdraw returned");
    }

    function test_Fork_UsdcDepositAndWithdrawAll_SameBlock() public {
        uint256 shares = _depositUsdc(1e6);
        uint256 out = _withdrawAllUsdc(shares);
        assertApproxEqAbs(out, 1e6, DUST, "principal back, at most Aave rounding dust lost");
    }

    function test_Fork_UsdcDepositAndWithdrawAll_NextBlock() public {
        uint256 shares = _depositUsdc(1e6);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 2);
        uint256 out = _withdrawAllUsdc(shares);
        assertApproxEqAbs(out, 1e6, DUST);
    }

    function test_Fork_EthDepositAndWithdrawAll_SameBlock() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 shares = ethVault.depositETH{value: 0.0005 ether}(user);

        uint256 before = user.balance;
        vm.prank(user);
        uint256 out = ethVault.withdrawETH(shares, user, user);
        assertEq(user.balance - before, out);
        assertApproxEqAbs(out, 0.0005 ether, DUST);
        assertEq(ethVault.totalSupply(), 0);
    }

    function test_Fork_EthDepositAndWithdrawAll_NextBlock() public {
        vm.deal(user, 1 ether);
        vm.prank(user);
        uint256 shares = ethVault.depositETH{value: 0.0005 ether}(user);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 2);

        vm.prank(user);
        uint256 out = ethVault.withdrawETH(shares, user, user);
        assertApproxEqAbs(out, 0.0005 ether, DUST);
    }

    /// Many small round trips on the same vault: every one must succeed and the vault never ends up
    /// owing more than it holds.
    function test_Fork_RepeatedRoundTrips() public {
        for (uint256 i = 1; i <= 8; i++) {
            uint256 shares = _depositUsdc(i * 1_234_567);
            if (i % 2 == 0) {
                vm.roll(block.number + 1);
                vm.warp(block.timestamp + 2);
            }
            _withdrawAllUsdc(shares);
        }
    }

    /// Two users: the first leaves right away (not the last one), then the second, last one leaves.
    function test_Fork_TwoUsersLastOneLeavesEverything() public {
        address other = makeAddr("hamstr-rounding-other");
        deal(B.USDC, other, 5e6);
        vm.startPrank(other);
        IERC20(B.USDC).approve(address(usdcVault), 5e6);
        uint256 otherShares = usdcVault.deposit(5e6, other);
        vm.stopPrank();
        uint256 shares = _depositUsdc(1e6);

        _withdrawAllUsdc(shares);
        vm.prank(other);
        uint256 out = usdcVault.withdraw(otherShares, other, other);
        assertApproxEqAbs(out, 5e6, DUST);
        assertEq(usdcVault.totalSupply(), 0);
    }

    /// Like the frontend's guided test run on a node that mines one block per transaction: deposit,
    /// then withdraw everything a few seconds later. Fuzzed over amount and delay.
    function testFuzz_Fork_UsdcRoundTrip(uint256 amount, uint256 delay) public {
        amount = bound(amount, 100, 1_000_000e6);
        delay = bound(delay, 0, 120);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);
        uint256 shares = _depositUsdc(amount);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + delay);
        uint256 out = _withdrawAllUsdc(shares);
        assertApproxEqAbs(out, amount, DUST);
    }

    function testFuzz_Fork_EthRoundTrip(uint256 amount, uint256 delay) public {
        amount = bound(amount, 1e9, 100 ether);
        delay = bound(delay, 0, 120);
        vm.deal(user, amount);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + 1);
        vm.prank(user);
        uint256 shares = ethVault.depositETH{value: amount}(user);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + delay);
        vm.prank(user);
        uint256 out = ethVault.withdrawETH(shares, user, user);
        assertApproxEqAbs(out, amount, DUST);
    }

    /// Talks to Aave directly: supply, wait, then withdraw exactly the reported aToken balance.
    function testFuzz_Fork_AaveExactBalanceWithdraw(uint256 amount, uint256 delay) public {
        amount = bound(amount, 100, 1_000_000e6);
        delay = bound(delay, 0, 3 days);
        IAaveV3Pool pool = IAaveV3Pool(B.AAVE_POOL);
        deal(B.USDC, address(this), amount);
        IERC20(B.USDC).approve(address(pool), amount);
        pool.supply(B.USDC, amount, address(this), 0);
        vm.roll(block.number + 1);
        vm.warp(block.timestamp + delay);
        uint256 bal = IERC20(B.AAVE_A_USDC).balanceOf(address(this));
        pool.withdraw(B.USDC, bal, address(this));
        assertEq(IERC20(B.USDC).balanceOf(address(this)), bal);
    }
}
