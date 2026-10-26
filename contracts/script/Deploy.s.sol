// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {BtcYieldVault} from "../src/BtcYieldVault.sol";
import {AaveV3Strategy} from "../src/strategies/AaveV3Strategy.sol";
import {OracleUniswapSwapper} from "../src/swappers/OracleUniswapSwapper.sol";
import {IAaveV3AToken} from "../src/interfaces/IAaveV3.sol";
import {IChainlinkAggregator, IUniswapV3SwapRouter02} from "../src/interfaces/IExternal.sol";
import {BaseAddresses as B} from "./BaseAddresses.sol";

/// @notice Deploys the Hamstr USDC and ETH vaults on Base (or a local fork of Base).
///
/// End state, checked at the end of `deploy`:
///  - TimelockController: only MULTISIG can propose/execute/cancel, no admin can bypass the delay.
///  - Vaults: DEFAULT_ADMIN_ROLE = timelock, GUARDIAN_ROLE = MULTISIG, KEEPER_ROLE = KEEPER.
///  - Swapper owner = timelock.
///  - The deployer keeps no rights anywhere.
///
/// Usage (values in .env or the shell):
///   MULTISIG=0x... KEEPER=0x... TREASURY=0x... \
///   forge script script/Deploy.s.sol --rpc-url base --broadcast --account <keystore-name>
contract Deploy is Script {
    struct Params {
        address multisig; // Safe that controls the timelock and acts as guardian
        address keeper; // hot wallet of the harvest bot
        address treasury; // receives performance fees
        uint256 timelockDelay;
        uint256 performanceFee;
        uint256 maxSlippageBps;
        uint32 oracleMaxAgeStable; // USDC/USD
        uint32 oracleMaxAgeVolatile; // ETH/USD, cbBTC/USD
        uint256 usdcCap;
        uint256 usdcUserCap;
        uint256 usdcMinHarvest;
        uint256 ethCap;
        uint256 ethUserCap;
        uint256 ethMinHarvest;
    }

    struct Deployment {
        TimelockController timelock;
        OracleUniswapSwapper swapper;
        BtcYieldVault usdcVault;
        AaveV3Strategy usdcStrategy;
        BtcYieldVault ethVault;
        AaveV3Strategy ethStrategy;
    }

    error UnsupportedChain(uint256 chainId);
    error SetupCheckFailed(string what);

    function run() external returns (Deployment memory d) {
        Params memory p = params();
        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        d = deploy(p, deployer);
        vm.stopBroadcast();
        _write(d, p);
    }

    /// @notice Beta defaults; every value can be overridden with an environment variable.
    function params() public view returns (Params memory p) {
        p.multisig = vm.envAddress("MULTISIG");
        p.keeper = vm.envAddress("KEEPER");
        p.treasury = vm.envOr("TREASURY", p.multisig);
        p.timelockDelay = vm.envOr("TIMELOCK_DELAY", uint256(2 days));
        p.performanceFee = vm.envOr("PERFORMANCE_FEE_BPS", uint256(1_000)); // 10%
        p.maxSlippageBps = vm.envOr("MAX_SLIPPAGE_BPS", uint256(100)); // 1% below Chainlink
        // Measured on Base (Oct 2026): USDC/USD updates every 24h, ETH/USD and cbBTC/USD at least
        // every ~20 min. Each limit is the heartbeat plus a margin.
        p.oracleMaxAgeStable = uint32(vm.envOr("ORACLE_MAX_AGE_STABLE", uint256(25 hours)));
        p.oracleMaxAgeVolatile = uint32(vm.envOr("ORACLE_MAX_AGE_VOLATILE", uint256(1 hours)));
        p.usdcCap = vm.envOr("USDC_CAP", uint256(50_000e6));
        p.usdcUserCap = vm.envOr("USDC_USER_CAP", uint256(5_000e6));
        p.usdcMinHarvest = vm.envOr("USDC_MIN_HARVEST", uint256(5e6)); // don't swap less than 5 USDC
        p.ethCap = vm.envOr("ETH_CAP", uint256(15 ether));
        p.ethUserCap = vm.envOr("ETH_USER_CAP", uint256(1.5 ether));
        p.ethMinHarvest = vm.envOr("ETH_MIN_HARVEST", uint256(0.002 ether));
    }

    function deploy(Params memory p, address deployer) public returns (Deployment memory d) {
        // Addresses in BaseAddresses only exist on Base; 31337 is a local anvil fork of Base.
        if (block.chainid != 8453 && block.chainid != 31337) revert UnsupportedChain(block.chainid);

        // 1. Timelock: the multisig proposes, waits `timelockDelay`, then executes.
        address[] memory team = new address[](1);
        team[0] = p.multisig;
        d.timelock = new TimelockController(p.timelockDelay, team, team, address(0));

        // 2. Swapper with Chainlink floor, owned by the timelock.
        d.swapper = new OracleUniswapSwapper(
            deployer, IUniswapV3SwapRouter02(B.UNISWAP_ROUTER), IChainlinkAggregator(B.SEQUENCER_UPTIME), p.maxSlippageBps
        );
        d.swapper.setFeed(B.USDC, IChainlinkAggregator(B.FEED_USDC_USD), p.oracleMaxAgeStable);
        d.swapper.setFeed(B.WETH, IChainlinkAggregator(B.FEED_ETH_USD), p.oracleMaxAgeVolatile);
        d.swapper.setFeed(B.CBBTC, IChainlinkAggregator(B.FEED_CBBTC_USD), p.oracleMaxAgeVolatile);
        d.swapper.setRoute(B.USDC, B.CBBTC, abi.encodePacked(B.USDC, B.FEE_USDC_CBBTC, B.CBBTC));
        d.swapper.setRoute(B.WETH, B.CBBTC, abi.encodePacked(B.WETH, B.FEE_WETH_CBBTC, B.CBBTC));
        d.swapper.transferOwnership(address(d.timelock));

        // 3. Vaults.
        (d.usdcVault, d.usdcStrategy) = _vault(
            p, deployer, d, B.USDC, B.AAVE_A_USDC, address(0), "Hamstr Dollar", "hamUSDC", p.usdcCap, p.usdcUserCap, p.usdcMinHarvest
        );
        (d.ethVault, d.ethStrategy) = _vault(
            p, deployer, d, B.WETH, B.AAVE_A_WETH, B.WETH, "Hamstr Ether", "hamETH", p.ethCap, p.ethUserCap, p.ethMinHarvest
        );

        _check(d, p, deployer);
    }

    function _vault(
        Params memory p,
        address deployer,
        Deployment memory d,
        address asset,
        address aToken,
        address weth,
        string memory name,
        string memory symbol,
        uint256 cap,
        uint256 userCap,
        uint256 minHarvest
    ) internal returns (BtcYieldVault vault, AaveV3Strategy strategy) {
        vault = new BtcYieldVault(
            BtcYieldVault.Config({
                asset: IERC20(asset),
                rewardToken: IERC20(B.CBBTC),
                name: name,
                symbol: symbol,
                admin: deployer, // temporary, handed to the timelock below
                guardian: p.multisig,
                keeper: p.keeper,
                feeRecipient: p.treasury,
                performanceFee: p.performanceFee,
                weth: weth
            })
        );
        strategy = new AaveV3Strategy(address(vault), asset, IAaveV3AToken(aToken));

        vault.setStrategy(strategy);
        vault.setSwapper(d.swapper);
        vault.setDepositCaps(cap, userCap);
        vault.setMinHarvest(minHarvest);

        vault.grantRole(vault.DEFAULT_ADMIN_ROLE(), address(d.timelock));
        vault.renounceRole(vault.DEFAULT_ADMIN_ROLE(), deployer);
    }

    /// @dev Fail the whole deployment if any permission ended up wrong.
    function _check(Deployment memory d, Params memory p, address deployer) internal view {
        TimelockController t = d.timelock;
        if (t.getMinDelay() != p.timelockDelay) revert SetupCheckFailed("timelock delay");
        if (!t.hasRole(t.PROPOSER_ROLE(), p.multisig)) revert SetupCheckFailed("timelock proposer");
        if (!t.hasRole(t.EXECUTOR_ROLE(), p.multisig)) revert SetupCheckFailed("timelock executor");
        if (t.hasRole(t.DEFAULT_ADMIN_ROLE(), deployer)) revert SetupCheckFailed("timelock admin");
        if (d.swapper.owner() != address(t)) revert SetupCheckFailed("swapper owner");

        BtcYieldVault[2] memory vaults = [d.usdcVault, d.ethVault];
        for (uint256 i; i < vaults.length; i++) {
            BtcYieldVault v = vaults[i];
            if (!v.hasRole(v.DEFAULT_ADMIN_ROLE(), address(t))) revert SetupCheckFailed("vault admin");
            if (v.hasRole(v.DEFAULT_ADMIN_ROLE(), deployer)) revert SetupCheckFailed("deployer still admin");
            if (!v.hasRole(v.GUARDIAN_ROLE(), p.multisig)) revert SetupCheckFailed("vault guardian");
            if (!v.hasRole(v.KEEPER_ROLE(), p.keeper)) revert SetupCheckFailed("vault keeper");
            if (address(v.swapper()) != address(d.swapper)) revert SetupCheckFailed("vault swapper");
        }
    }

    /// @dev Writes deployments/<chainId>.json, which the frontend sync script picks up.
    function _write(Deployment memory d, Params memory p) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "block", block.number);
        vm.serializeAddress(k, "timelock", address(d.timelock));
        vm.serializeAddress(k, "multisig", p.multisig);
        vm.serializeAddress(k, "keeper", p.keeper);
        vm.serializeAddress(k, "treasury", p.treasury);
        vm.serializeAddress(k, "swapper", address(d.swapper));
        vm.serializeAddress(k, "usdcVault", address(d.usdcVault));
        vm.serializeAddress(k, "usdcStrategy", address(d.usdcStrategy));
        vm.serializeAddress(k, "ethVault", address(d.ethVault));
        vm.serializeAddress(k, "ethStrategy", address(d.ethStrategy));
        vm.serializeAddress(k, "usdc", B.USDC);
        vm.serializeAddress(k, "weth", B.WETH);
        string memory json = vm.serializeAddress(k, "cbbtc", B.CBBTC);

        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Deployment written to", path);
    }
}
