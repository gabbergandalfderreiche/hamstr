// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {ISwapper} from "./interfaces/ISwapper.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {IUniswapV3Pool, INonfungiblePositionManager} from "./interfaces/IUniswapV3.sol";
import {TickMath, LiquidityAmounts} from "./libraries/UniswapV3Math.sol";
import {OracleUniswapSwapper} from "./swappers/OracleUniswapSwapper.sol";

/// @title TurboVault – HIGH RISK
/// @notice Users deposit ETH. The vault provides concentrated WETH/cbBTC liquidity on Uniswap V3 and
/// pays the trading fees out as cbBTC. The deposit itself is NOT protected: when BTC and ETH move
/// apart, the position ends up holding more of the weaker coin (impermanent loss), and a withdrawal
/// makes that loss final.
///
/// Mechanics:
///  - Deposits sit idle as WETH until the keeper puts them into the position (`deployIdle`), so a
///    deposit never swaps. Shares are priced with Chainlink, never with the pool price.
///  - Withdrawals take the shares' part of the position and of the idle tokens, swap the cbBTC part
///    to WETH and pay out ETH/WETH.
///  - Trading fees are collected on every deposit, withdrawal, transfer and keeper action and
///    credited per share (in WETH and cbBTC), so new depositors never get fees earned before them.
///    `claim` pays them out, converting the WETH part to cbBTC.
///  - The keeper re-centers the range when the price leaves it (`rebalance`).
///  - Every action that touches the pool (withdraw, rebalance, deployIdle) first checks that the
///    pool price is within `maxPriceDeviationBps` of Chainlink, so a manipulated pool cannot be used
///    to drain the vault.
///
/// Roles as in BtcYieldVault: DEFAULT_ADMIN_ROLE (timelock), GUARDIAN_ROLE (pause, exit position),
/// KEEPER_ROLE (rebalance, deployIdle). Withdrawals and claims stay open while paused.
contract TurboVault is ERC20, AccessControl, Pausable, ReentrancyGuard, IERC721Receiver {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant MAX_BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE = 2_000;
    uint256 public constant MAX_PRICE_DEVIATION = 300;
    int24 public constant MIN_HALF_WIDTH = 100;
    int24 public constant MAX_HALF_WIDTH = 20_000;
    /// @dev Virtual shares/assets against the first-depositor inflation attack (as in OpenZeppelin ERC4626).
    uint256 private constant VIRTUAL_SHARES = 1e6;
    uint256 private constant ACC = 1e36;
    uint256 private constant Q96 = 2 ** 96;

    IERC20 public immutable weth; // token0 of the pool
    IERC20 public immutable cbbtc; // token1 of the pool
    IUniswapV3Pool public immutable pool;
    INonfungiblePositionManager public immutable positionManager;
    uint24 public immutable poolFee;
    int24 public immutable tickSpacing;

    OracleUniswapSwapper public swapper;
    address public feeRecipient;
    uint256 public performanceFee;
    uint256 public depositCap;
    uint256 public userDepositCap;
    uint256 public maxPriceDeviationBps;
    /// @notice Range half-width in ticks (100 ticks ≈ 1 %).
    int24 public halfWidthTicks;

    uint256 public positionId;
    int24 public tickLower;
    int24 public tickUpper;

    /// @notice Fees per share, scaled by 1e36, in WETH (0) and cbBTC (1).
    uint256 public accFee0PerShare;
    uint256 public accFee1PerShare;
    /// @notice Fee tokens held for users; not part of the deposits.
    uint256 public reserved0;
    uint256 public reserved1;
    /// @notice ETH a user put in, net of withdrawals – lets the UI show value vs. what was deposited.
    mapping(address => uint256) public principalOf;

    struct Rewards {
        uint256 debt0;
        uint256 debt1;
        uint256 owed0;
        uint256 owed1;
    }

    mapping(address => Rewards) public rewards;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets, uint256 shares);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 assets);
    event Claim(address indexed user, address indexed receiver, uint256 cbbtcOut, uint256 wethOut);
    event FeesCollected(uint256 amount0, uint256 amount1, uint256 protocol0, uint256 protocol1);
    event Rebalanced(int24 tickLower, int24 tickUpper, uint256 positionId);
    event Deployed(uint256 amount0, uint256 amount1);
    event PositionExited(uint256 amount0, uint256 amount1);
    event ParamsUpdated();

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh();
    error InvalidParam();
    error ExceedsDepositCap(uint256 assets, uint256 max);
    error PriceDeviation(uint256 poolSqrtPrice, uint256 oracleSqrtPrice);
    error Slippage(uint256 out, uint256 minOut);
    error NoPosition();
    error OnlyWETH();
    error NotPositionManager();

    struct Config {
        IERC20 weth;
        IERC20 cbbtc;
        IUniswapV3Pool pool;
        INonfungiblePositionManager positionManager;
        OracleUniswapSwapper swapper;
        address admin;
        address guardian;
        address keeper;
        address feeRecipient;
        uint256 performanceFee;
        int24 halfWidthTicks;
    }

    constructor(Config memory c) ERC20("Hamstr Turbo", "hamTURBO") {
        if (c.admin == address(0) || c.guardian == address(0) || c.keeper == address(0)) revert ZeroAddress();
        if (c.pool.token0() != address(c.weth) || c.pool.token1() != address(c.cbbtc)) revert InvalidParam();

        weth = c.weth;
        cbbtc = c.cbbtc;
        pool = c.pool;
        positionManager = c.positionManager;
        poolFee = c.pool.fee();
        tickSpacing = c.pool.tickSpacing();

        _grantRole(DEFAULT_ADMIN_ROLE, c.admin);
        _grantRole(GUARDIAN_ROLE, c.guardian);
        _grantRole(KEEPER_ROLE, c.keeper);

        swapper = c.swapper;
        _setFeeRecipient(c.feeRecipient);
        _setPerformanceFee(c.performanceFee);
        _setHalfWidth(c.halfWidthTicks);
        maxPriceDeviationBps = 100;
        depositCap = type(uint256).max;
        userDepositCap = type(uint256).max;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Everything belonging to depositors, valued in WETH at the Chainlink price.
    function totalAssets() public view returns (uint256) {
        (uint256 amount0, uint256 amount1) = _principalAmounts(_oracleSqrtPrice());
        return amount0 + (amount1 == 0 ? 0 : swapper.quote(address(cbbtc), address(weth), amount1));
    }

    /// @notice Token amounts belonging to depositors (position at `sqrtPrice` plus idle tokens).
    function principalAmounts() external view returns (uint256 amount0, uint256 amount1) {
        return _principalAmounts(_oracleSqrtPrice());
    }

    function convertToAssets(uint256 shares) public view returns (uint256) {
        return shares.mulDiv(totalAssets() + 1, totalSupply() + VIRTUAL_SHARES);
    }

    function convertToShares(uint256 assets) public view returns (uint256) {
        return assets.mulDiv(totalSupply() + VIRTUAL_SHARES, totalAssets() + 1);
    }

    function maxDeposit(address receiver) public view returns (uint256) {
        if (paused()) return 0;
        uint256 assets = totalAssets();
        uint256 vaultRoom = depositCap > assets ? depositCap - assets : 0;
        uint256 held = convertToAssets(balanceOf(receiver));
        uint256 userRoom = userDepositCap > held ? userDepositCap - held : 0;
        return Math.min(vaultRoom, userRoom);
    }

    /// @notice True while the current pool price is inside the position's range.
    function inRange() public view returns (bool) {
        if (positionId == 0) return false;
        (, int24 tick,,,,,) = pool.slot0();
        return tick >= tickLower && tick < tickUpper;
    }

    /// @notice Claimable fees of `user` (not counting fees still uncollected in the pool).
    function claimable(address user) external view returns (uint256 owed0, uint256 owed1) {
        Rewards memory r = rewards[user];
        uint256 bal = balanceOf(user);
        owed0 = r.owed0 + bal.mulDiv(accFee0PerShare - r.debt0, ACC);
        owed1 = r.owed1 + bal.mulDiv(accFee1PerShare - r.debt1, ACC);
    }

    // ---------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256 shares) {
        shares = _prepareDeposit(assets, receiver);
        weth.safeTransferFrom(msg.sender, address(this), assets);
        _finishDeposit(assets, shares, receiver);
    }

    function depositETH(address receiver) external payable nonReentrant returns (uint256 shares) {
        shares = _prepareDeposit(msg.value, receiver);
        IWETH(address(weth)).deposit{value: msg.value}();
        _finishDeposit(msg.value, shares, receiver);
    }

    /// @notice Burn `shares` of `owner` and receive WETH. `minAssetsOut` protects against slippage.
    function withdraw(uint256 shares, address receiver, address owner, uint256 minAssetsOut)
        external
        nonReentrant
        returns (uint256 assets)
    {
        assets = _withdraw(shares, owner, minAssetsOut);
        weth.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, shares, assets);
    }

    /// @notice Like `withdraw`, but pays out native ETH.
    function withdrawETH(uint256 shares, address receiver, address owner, uint256 minAssetsOut)
        external
        nonReentrant
        returns (uint256 assets)
    {
        assets = _withdraw(shares, owner, minAssetsOut);
        IWETH(address(weth)).withdraw(assets);
        Address.sendValue(payable(receiver), assets);
        emit Withdraw(msg.sender, receiver, owner, shares, assets);
    }

    /// @notice Pay out the caller's earned fees. With `toBitcoin`, the WETH part is swapped to cbBTC.
    function claim(address receiver, bool toBitcoin) external nonReentrant returns (uint256 btcOut, uint256 wethOut) {
        _collectFees();
        _checkpoint(msg.sender);
        Rewards storage r = rewards[msg.sender];
        uint256 owed0 = r.owed0;
        btcOut = r.owed1;
        r.owed0 = 0;
        r.owed1 = 0;
        reserved0 -= owed0;
        reserved1 -= btcOut;

        if (!toBitcoin) {
            wethOut = owed0;
        } else if (owed0 > 0) {
            if (swapper.quote(address(weth), address(cbbtc), owed0) == 0) {
                // Worth less than one sat: swapping would round it away, so keep it credited.
                r.owed0 = owed0;
                reserved0 += owed0;
            } else {
                btcOut += _swap(weth, cbbtc, owed0);
            }
        }
        if (btcOut > 0) cbbtc.safeTransfer(receiver, btcOut);
        if (wethOut > 0) weth.safeTransfer(receiver, wethOut);
        emit Claim(msg.sender, receiver, btcOut, wethOut);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _collectFees();
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _collectFees();
        return super.transferFrom(from, to, value);
    }

    receive() external payable {
        if (msg.sender != address(weth)) revert OnlyWETH();
    }

    function onERC721Received(address, address, uint256, bytes calldata) external view returns (bytes4) {
        if (msg.sender != address(positionManager)) revert NotPositionManager();
        return IERC721Receiver.onERC721Received.selector;
    }

    // ---------------------------------------------------------------------
    // Keeper
    // ---------------------------------------------------------------------

    /// @notice Close the current position and open a new one centered on the current price.
    function rebalance() external nonReentrant onlyRole(KEEPER_ROLE) {
        _checkPoolPrice();
        _collectFees();
        _exitPosition();

        (, int24 tick,,,,,) = pool.slot0();
        int24 lower = _floorTick(tick - halfWidthTicks);
        int24 upper = _floorTick(tick + halfWidthTicks) + tickSpacing;
        tickLower = lower;
        tickUpper = upper;

        _swapToRatio(lower, upper);
        (uint256 idle0, uint256 idle1) = _idle();
        if (idle0 == 0 && idle1 == 0) revert ZeroAmount();
        weth.forceApprove(address(positionManager), idle0);
        cbbtc.forceApprove(address(positionManager), idle1);
        (uint256 id,,,) = positionManager.mint(
            INonfungiblePositionManager.MintParams({
                token0: address(weth),
                token1: address(cbbtc),
                fee: poolFee,
                tickLower: lower,
                tickUpper: upper,
                amount0Desired: idle0,
                amount1Desired: idle1,
                amount0Min: 0, // the pool price was just checked against Chainlink
                amount1Min: 0,
                recipient: address(this),
                deadline: block.timestamp
            })
        );
        positionId = id;
        emit Rebalanced(lower, upper, id);
    }

    /// @notice Put idle deposits into the current position.
    function deployIdle() external nonReentrant onlyRole(KEEPER_ROLE) whenNotPaused {
        if (positionId == 0) revert NoPosition();
        _checkPoolPrice();
        _collectFees();
        _swapToRatio(tickLower, tickUpper);
        (uint256 idle0, uint256 idle1) = _idle();
        weth.forceApprove(address(positionManager), idle0);
        cbbtc.forceApprove(address(positionManager), idle1);
        (, uint256 used0, uint256 used1) = positionManager.increaseLiquidity(
            INonfungiblePositionManager.IncreaseLiquidityParams({
                tokenId: positionId,
                amount0Desired: idle0,
                amount1Desired: idle1,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp
            })
        );
        emit Deployed(used0, used1);
    }

    // ---------------------------------------------------------------------
    // Guardian / admin
    // ---------------------------------------------------------------------

    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /// @notice Pause and pull all liquidity out of Uniswap into the vault (no swaps).
    function emergencyExit() external nonReentrant onlyRole(GUARDIAN_ROLE) {
        if (!paused()) _pause();
        _collectFees();
        _exitPosition();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    function setSwapper(OracleUniswapSwapper newSwapper) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newSwapper) == address(0)) revert ZeroAddress();
        swapper = newSwapper;
        emit ParamsUpdated();
    }

    function setPerformanceFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _collectFees();
        _setPerformanceFee(fee);
    }

    function setFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFeeRecipient(recipient);
    }

    function setDepositCaps(uint256 depositCap_, uint256 userDepositCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositCap = depositCap_;
        userDepositCap = userDepositCap_;
        emit ParamsUpdated();
    }

    function setHalfWidth(int24 halfWidth) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setHalfWidth(halfWidth);
    }

    function setMaxPriceDeviation(uint256 bps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (bps == 0 || bps > MAX_PRICE_DEVIATION) revert InvalidParam();
        maxPriceDeviationBps = bps;
        emit ParamsUpdated();
    }

    // ---------------------------------------------------------------------
    // Internals: deposits and withdrawals
    // ---------------------------------------------------------------------

    function _prepareDeposit(uint256 assets, address receiver) internal returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        uint256 max = maxDeposit(receiver);
        if (assets > max) revert ExceedsDepositCap(assets, max);
        _collectFees();
        // Priced before the deposit lands in the vault's balance.
        shares = convertToShares(assets);
        if (shares == 0) revert ZeroAmount();
    }

    function _finishDeposit(uint256 assets, uint256 shares, address receiver) internal {
        _mint(receiver, shares);
        principalOf[receiver] += assets;
        emit Deposit(msg.sender, receiver, assets, shares);
    }

    function _withdraw(uint256 shares, address owner, uint256 minAssetsOut) internal returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        _checkPoolPrice();
        _collectFees();

        uint256 supply = totalSupply();
        (uint256 idle0, uint256 idle1) = _idle();
        uint256 out0 = idle0.mulDiv(shares, supply);
        uint256 out1 = idle1.mulDiv(shares, supply);

        if (positionId != 0) {
            uint128 liquidity = positionManager.positions(positionId).liquidity;
            uint128 part = uint128(uint256(liquidity).mulDiv(shares, supply));
            if (part > 0) {
                positionManager.decreaseLiquidity(
                    INonfungiblePositionManager.DecreaseLiquidityParams({
                        tokenId: positionId,
                        liquidity: part,
                        amount0Min: 0, // pool price checked above
                        amount1Min: 0,
                        deadline: block.timestamp
                    })
                );
                // Fees were collected a moment ago, so this returns exactly the withdrawn liquidity.
                (uint256 got0, uint256 got1) = _collectFromPosition();
                out0 += got0;
                out1 += got1;
            }
        }

        uint256 balance = balanceOf(owner);
        principalOf[owner] -= principalOf[owner].mulDiv(shares, balance);
        _burn(owner, shares);

        assets = out0 + (out1 == 0 ? 0 : _swap(cbbtc, weth, out1));
        if (assets < minAssetsOut) revert Slippage(assets, minAssetsOut);
    }

    // ---------------------------------------------------------------------
    // Internals: fees
    // ---------------------------------------------------------------------

    /// @dev Collect trading fees from the position and credit them to current shareholders.
    function _collectFees() internal {
        if (positionId == 0) return;
        (uint256 amount0, uint256 amount1) = _collectFromPosition();
        if (amount0 == 0 && amount1 == 0) return;

        uint256 supply = totalSupply();
        uint256 protocol0 = supply == 0 ? amount0 : amount0.mulDiv(performanceFee, MAX_BPS);
        uint256 protocol1 = supply == 0 ? amount1 : amount1.mulDiv(performanceFee, MAX_BPS);
        if (protocol0 > 0) weth.safeTransfer(feeRecipient, protocol0);
        if (protocol1 > 0) cbbtc.safeTransfer(feeRecipient, protocol1);

        if (supply > 0) {
            uint256 delta0 = (amount0 - protocol0).mulDiv(ACC, supply);
            uint256 delta1 = (amount1 - protocol1).mulDiv(ACC, supply);
            accFee0PerShare += delta0;
            accFee1PerShare += delta1;
            // Reserve exactly what holders can claim; the rounding remainder joins the deposits.
            reserved0 += delta0.mulDiv(supply, ACC);
            reserved1 += delta1.mulDiv(supply, ACC);
        }
        emit FeesCollected(amount0, amount1, protocol0, protocol1);
    }

    function _collectFromPosition() internal returns (uint256 amount0, uint256 amount1) {
        return positionManager.collect(
            INonfungiblePositionManager.CollectParams({
                tokenId: positionId,
                recipient: address(this),
                amount0Max: type(uint128).max,
                amount1Max: type(uint128).max
            })
        );
    }

    /// @dev Settle both sides before share balances change.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) _checkpoint(from);
        if (to != address(0) && to != from) _checkpoint(to);
        // Plain transfers move the matching part of the deposited-ETH record along.
        if (from != address(0) && to != address(0) && from != to) {
            uint256 moved = principalOf[from].mulDiv(value, balanceOf(from));
            principalOf[from] -= moved;
            principalOf[to] += moved;
        }
        super._update(from, to, value);
    }

    function _checkpoint(address user) internal {
        Rewards storage r = rewards[user];
        uint256 bal = balanceOf(user);
        r.owed0 += bal.mulDiv(accFee0PerShare - r.debt0, ACC);
        r.owed1 += bal.mulDiv(accFee1PerShare - r.debt1, ACC);
        r.debt0 = accFee0PerShare;
        r.debt1 = accFee1PerShare;
    }

    // ---------------------------------------------------------------------
    // Internals: position and prices
    // ---------------------------------------------------------------------

    function _idle() internal view returns (uint256 idle0, uint256 idle1) {
        idle0 = weth.balanceOf(address(this)) - reserved0;
        idle1 = cbbtc.balanceOf(address(this)) - reserved1;
    }

    function _principalAmounts(uint160 sqrtPrice) internal view returns (uint256 amount0, uint256 amount1) {
        (amount0, amount1) = _idle();
        if (positionId != 0) {
            uint128 liquidity = positionManager.positions(positionId).liquidity;
            (uint256 p0, uint256 p1) = LiquidityAmounts.getAmountsForLiquidity(
                sqrtPrice, TickMath.getSqrtRatioAtTick(tickLower), TickMath.getSqrtRatioAtTick(tickUpper), liquidity
            );
            amount0 += p0;
            amount1 += p1;
        }
    }

    function _exitPosition() internal {
        uint256 id = positionId;
        if (id == 0) return;
        uint128 liquidity = positionManager.positions(id).liquidity;
        if (liquidity > 0) {
            positionManager.decreaseLiquidity(
                INonfungiblePositionManager.DecreaseLiquidityParams({
                    tokenId: id,
                    liquidity: liquidity,
                    amount0Min: 0,
                    amount1Min: 0,
                    deadline: block.timestamp
                })
            );
        }
        (uint256 amount0, uint256 amount1) = _collectFromPosition();
        positionManager.burn(id);
        positionId = 0;
        emit PositionExited(amount0, amount1);
    }

    /// @dev Swap idle tokens so their ratio matches what the range needs at the current price.
    function _swapToRatio(int24 lower, int24 upper) internal {
        (uint256 idle0, uint256 idle1) = _idle();
        (uint160 sqrtP,,,,,,) = pool.slot0();
        uint160 sqrtA = TickMath.getSqrtRatioAtTick(lower);
        uint160 sqrtB = TickMath.getSqrtRatioAtTick(upper);

        if (sqrtP <= sqrtA) {
            if (idle1 > 0) _swap(cbbtc, weth, idle1);
            return;
        }
        if (sqrtP >= sqrtB) {
            if (idle0 > 0) _swap(weth, cbbtc, idle0);
            return;
        }

        uint256 target0 = _targetAmount0(idle0, idle1, sqrtP, sqrtA, sqrtB);
        if (idle0 > target0) {
            uint256 excess0 = idle0 - target0;
            if (excess0 > 1e9) _swap(weth, cbbtc, excess0);
        } else {
            uint256 missing1 = Math.min((target0 - idle0).mulDiv(sqrtP, Q96).mulDiv(sqrtP, Q96), idle1);
            if (missing1 > 0) _swap(cbbtc, weth, missing1);
        }
    }

    /// @dev How much of all idle value (in token0) should be token0 for a position in [sqrtA, sqrtB].
    function _targetAmount0(uint256 idle0, uint256 idle1, uint160 sqrtP, uint160 sqrtA, uint160 sqrtB)
        internal
        pure
        returns (uint256)
    {
        // What one unit of liquidity needs of each token, valued in token0 at the current price.
        uint256 need0 = LiquidityAmounts.getAmount0ForLiquidity(sqrtP, sqrtB, 1e18);
        uint256 need1In0 = LiquidityAmounts.getAmount1ForLiquidity(sqrtA, sqrtP, 1e18).mulDiv(Q96, sqrtP).mulDiv(
            Q96, sqrtP
        );
        uint256 total0 = idle0 + idle1.mulDiv(Q96, sqrtP).mulDiv(Q96, sqrtP);
        return total0.mulDiv(need0, need0 + need1In0);
    }

    function _swap(IERC20 tokenIn, IERC20 tokenOut, uint256 amountIn) internal returns (uint256 out) {
        uint256 before = tokenOut.balanceOf(address(this));
        tokenIn.forceApprove(address(swapper), amountIn);
        swapper.swap(address(tokenIn), address(tokenOut), amountIn, 0, address(this));
        out = tokenOut.balanceOf(address(this)) - before;
    }

    /// @dev sqrt(price) * 2^96 at the Chainlink price (token1 per token0, raw units).
    function _oracleSqrtPrice() internal view returns (uint160) {
        uint256 oneEth = 1e18;
        uint256 btcPerEth = swapper.quote(address(weth), address(cbbtc), oneEth);
        return uint160(Math.sqrt(btcPerEth.mulDiv(2 ** 192, oneEth)));
    }

    /// @dev Reverts if the pool price is more than `maxPriceDeviationBps` away from Chainlink.
    function _checkPoolPrice() internal view {
        (uint160 poolSqrt,,,,,,) = pool.slot0();
        uint256 oracleSqrt = _oracleSqrtPrice();
        uint256 diff = poolSqrt > oracleSqrt ? poolSqrt - oracleSqrt : oracleSqrt - poolSqrt;
        // A price deviation of d corresponds to about d/2 in sqrt(price).
        if (diff.mulDiv(2 * MAX_BPS, oracleSqrt) > maxPriceDeviationBps) revert PriceDeviation(poolSqrt, oracleSqrt);
    }

    function _floorTick(int24 tick) internal view returns (int24) {
        int24 compressed = tick / tickSpacing;
        if (tick < 0 && tick % tickSpacing != 0) compressed--;
        return compressed * tickSpacing;
    }

    function _setPerformanceFee(uint256 fee) internal {
        if (fee > MAX_PERFORMANCE_FEE) revert FeeTooHigh();
        performanceFee = fee;
        emit ParamsUpdated();
    }

    function _setFeeRecipient(address recipient) internal {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit ParamsUpdated();
    }

    function _setHalfWidth(int24 halfWidth) internal {
        if (halfWidth < MIN_HALF_WIDTH || halfWidth > MAX_HALF_WIDTH) revert InvalidParam();
        halfWidthTicks = halfWidth;
        emit ParamsUpdated();
    }
}
