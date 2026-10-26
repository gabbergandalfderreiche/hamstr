// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {TurboVault} from "../src/TurboVault.sol";
import {OracleUniswapSwapper} from "../src/swappers/OracleUniswapSwapper.sol";
import {IUniswapV3Pool, INonfungiblePositionManager} from "../src/interfaces/IUniswapV3.sol";
import {IChainlinkAggregator, IUniswapV3SwapRouter02} from "../src/interfaces/IExternal.sol";
import {BaseAddresses as B} from "./BaseAddresses.sol";

/// @notice Adds the high-risk Turbo vault to an existing Hamstr deployment.
///
/// Reads timelock, multisig, keeper and treasury from deployments/<chainId>.json (written by
/// Deploy.s.sol), deploys a dedicated swapper (WETH <-> cbBTC) and the TurboVault, hands both to the
/// existing timelock and appends their addresses to the same deployments file.
contract DeployTurbo is Script {
    address internal constant POOL_WETH_CBBTC = 0x7AeA2E8A3843516afa07293a10Ac8E49906dabD1; // 0.05 %
    address internal constant POSITION_MANAGER = 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1;

    struct Params {
        address timelock;
        address multisig;
        address keeper;
        address treasury;
        uint256 cap;
        uint256 userCap;
        int24 halfWidthTicks;
        uint256 performanceFee;
    }

    error SetupCheckFailed(string what);

    function run() external returns (TurboVault vault, OracleUniswapSwapper swapper) {
        Params memory p = params();
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        (vault, swapper) = deploy(p, deployer);
        vm.stopBroadcast();
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) _append(vault, swapper);
        else console.log("Dry run - deployments file not written");
    }

    function params() public view returns (Params memory p) {
        string memory json = vm.readFile(_deploymentPath());
        p.timelock = vm.parseJsonAddress(json, ".timelock");
        p.multisig = vm.parseJsonAddress(json, ".multisig");
        p.keeper = vm.parseJsonAddress(json, ".keeper");
        p.treasury = vm.parseJsonAddress(json, ".treasury");
        p.cap = vm.envOr("TURBO_CAP", uint256(0.5 ether));
        p.userCap = vm.envOr("TURBO_USER_CAP", uint256(0.2 ether));
        p.halfWidthTicks = int24(int256(vm.envOr("TURBO_HALF_WIDTH_TICKS", uint256(800)))); // ≈ ±8 %
        p.performanceFee = vm.envOr("TURBO_PERFORMANCE_FEE_BPS", uint256(1_000));
    }

    function deploy(Params memory p, address deployer) public returns (TurboVault vault, OracleUniswapSwapper swapper) {
        swapper = new OracleUniswapSwapper(
            deployer, IUniswapV3SwapRouter02(B.UNISWAP_ROUTER), IChainlinkAggregator(B.SEQUENCER_UPTIME), 100
        );
        swapper.setFeed(B.WETH, IChainlinkAggregator(B.FEED_ETH_USD), 1 hours);
        swapper.setFeed(B.CBBTC, IChainlinkAggregator(B.FEED_CBBTC_USD), 1 hours);
        swapper.setRoute(B.WETH, B.CBBTC, abi.encodePacked(B.WETH, uint24(500), B.CBBTC));
        swapper.setRoute(B.CBBTC, B.WETH, abi.encodePacked(B.CBBTC, uint24(500), B.WETH));
        swapper.transferOwnership(p.timelock);

        vault = new TurboVault(
            TurboVault.Config({
                weth: IERC20(B.WETH),
                cbbtc: IERC20(B.CBBTC),
                pool: IUniswapV3Pool(POOL_WETH_CBBTC),
                positionManager: INonfungiblePositionManager(POSITION_MANAGER),
                swapper: swapper,
                admin: deployer, // temporary, handed to the timelock below
                guardian: p.multisig,
                keeper: p.keeper,
                feeRecipient: p.treasury,
                performanceFee: p.performanceFee,
                halfWidthTicks: p.halfWidthTicks
            })
        );
        vault.setDepositCaps(p.cap, p.userCap);
        vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), p.timelock);
        vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), deployer);

        if (swapper.owner() != p.timelock) revert SetupCheckFailed("swapper owner");
        if (!vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), p.timelock)) revert SetupCheckFailed("admin");
        if (vault.hasRole(vault.DEFAULT_ADMIN_ROLE(), deployer)) revert SetupCheckFailed("deployer still admin");
        if (!vault.hasRole(vault.GUARDIAN_ROLE(), p.multisig)) revert SetupCheckFailed("guardian");
        if (!vault.hasRole(vault.KEEPER_ROLE(), p.keeper)) revert SetupCheckFailed("keeper");
    }

    function _deploymentPath() internal view returns (string memory) {
        return string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
    }

    /// @dev Re-writes the deployments file with all existing entries plus the Turbo addresses.
    function _append(TurboVault vault, OracleUniswapSwapper swapper) internal {
        string memory path = _deploymentPath();
        string memory json = vm.readFile(path);
        string[12] memory addressKeys = [
            "timelock", "multisig", "keeper", "treasury", "swapper", "usdcVault", "usdcStrategy",
            "ethVault", "ethStrategy", "usdc", "weth", "cbbtc"
        ];
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", vm.parseJsonUint(json, ".chainId"));
        vm.serializeUint(k, "block", vm.parseJsonUint(json, ".block"));
        for (uint256 i; i < addressKeys.length; i++) {
            vm.serializeAddress(k, addressKeys[i], vm.parseJsonAddress(json, string.concat(".", addressKeys[i])));
        }
        vm.serializeAddress(k, "turboSwapper", address(swapper));
        string memory out = vm.serializeAddress(k, "turboVault", address(vault));
        vm.writeJson(out, path);
        console.log("Turbo addresses added to", path);
    }
}
