// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IStrategy} from "./interfaces/IStrategy.sol";
import {IWETH} from "./interfaces/IWETH.sol";

/// @title YieldVault
/// @notice ERC-4626 vault built on OpenZeppelin's audited implementation. Users deposit one asset and
/// receive shares; a single pluggable strategy earns yield on the deposits.
///
/// Fees are transparent and only taken from the vault's growth:
///  - performance fee: a share of new profit above the high-water mark (never charged on losses or
///    on recovering earlier losses)
///  - management fee: a small yearly percentage of assets, accrued per second
/// Both are capped by constants in this contract and paid by minting new shares to `feeRecipient`.
///
/// Roles:
///  - DEFAULT_ADMIN_ROLE: changes strategy, fees and caps. Meant to be a TimelockController owned by a
///    multisig, so every change is announced before it takes effect.
///  - GUARDIAN_ROLE: can pause deposits and pull all funds back from the strategy at once. Meant to be
///    a multisig that can react quickly. Withdrawals always stay open, also while paused.
contract YieldVault is ERC4626, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");

    uint256 public constant MAX_BPS = 10_000;
    /// @notice Performance fee can never exceed 20% of profit.
    uint256 public constant MAX_PERFORMANCE_FEE = 2_000;
    /// @notice Management fee can never exceed 2% per year.
    uint256 public constant MAX_MANAGEMENT_FEE = 200;
    uint256 private constant YEAR = 365 days;
    /// @dev Virtual share offset; makes the classic first-depositor inflation attack uneconomical.
    uint8 private constant DECIMALS_OFFSET = 6;

    /// @notice WETH address if the asset is WETH (enables native ETH deposits), otherwise zero.
    address public immutable weth;

    IStrategy public strategy;
    address public feeRecipient;
    uint256 public performanceFee;
    uint256 public managementFee;
    /// @notice Highest price per share on which performance fees were already charged.
    uint256 public highWaterMark;
    uint256 public lastFeeAccrual;
    /// @notice Maximum total assets the vault accepts.
    uint256 public depositCap;
    /// @notice Maximum assets a single address may hold in the vault.
    uint256 public userDepositCap;

    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event FeesUpdated(uint256 performanceFee, uint256 managementFee);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event DepositCapsUpdated(uint256 depositCap, uint256 userDepositCap);
    event FeesAccrued(uint256 feeAssets, uint256 feeShares, uint256 pricePerShare);
    event EmergencyWithdraw(uint256 amount);

    error ZeroAddress();
    error FeeTooHigh();
    error StrategyMismatch();
    error NotWETHVault();
    error OnlyWETH();

    constructor(
        IERC20 asset_,
        string memory name_,
        string memory symbol_,
        address admin,
        address guardian,
        address feeRecipient_,
        uint256 performanceFee_,
        uint256 managementFee_,
        address weth_
    ) ERC20(name_, symbol_) ERC4626(asset_) {
        if (admin == address(0) || guardian == address(0)) revert ZeroAddress();
        if (weth_ != address(0) && weth_ != address(asset_)) revert NotWETHVault();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(GUARDIAN_ROLE, guardian);
        weth = weth_;

        _setFeeRecipient(feeRecipient_);
        _setFees(performanceFee_, managementFee_);
        depositCap = type(uint256).max;
        userDepositCap = type(uint256).max;

        highWaterMark = _pricePerShare(0, 0);
        lastFeeAccrual = block.timestamp;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    /// @notice Idle balance plus everything the strategy holds.
    function totalAssets() public view override returns (uint256) {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        IStrategy s = strategy;
        return address(s) == address(0) ? idle : idle + s.totalAssets();
    }

    /// @notice Assets one whole share (10**decimals()) is worth right now, before pending fees.
    function pricePerShare() external view returns (uint256) {
        return _pricePerShare(totalAssets(), totalSupply());
    }

    /// @notice Respects the pause flag and both deposit caps.
    function maxDeposit(address receiver) public view override returns (uint256) {
        if (paused()) return 0;

        uint256 assets = totalAssets();
        uint256 vaultRoom = depositCap > assets ? depositCap - assets : 0;

        uint256 held = convertToAssets(balanceOf(receiver));
        uint256 userRoom = userDepositCap > held ? userDepositCap - held : 0;

        return Math.min(vaultRoom, userRoom);
    }

    function maxMint(address receiver) public view override returns (uint256) {
        uint256 assets = maxDeposit(receiver);
        return assets == type(uint256).max ? assets : _convertToShares(assets, Math.Rounding.Floor);
    }

    // ---------------------------------------------------------------------
    // User actions (fees are settled first so every user gets a fair price)
    // ---------------------------------------------------------------------

    function deposit(uint256 assets, address receiver) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.deposit(assets, receiver);
    }

    function mint(uint256 shares, address receiver) public override nonReentrant returns (uint256) {
        _accrueFees();
        return super.mint(shares, receiver);
    }

    function withdraw(uint256 assets, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _accrueFees();
        return super.withdraw(assets, receiver, owner);
    }

    function redeem(uint256 shares, address receiver, address owner)
        public
        override
        nonReentrant
        returns (uint256)
    {
        _accrueFees();
        return super.redeem(shares, receiver, owner);
    }

    /// @notice Deposit native ETH; it is wrapped to WETH. Lets newcomers skip the wrap + approve steps.
    function depositETH(address receiver) external payable nonReentrant returns (uint256 shares) {
        if (weth == address(0)) revert NotWETHVault();
        _accrueFees();

        uint256 assets = msg.value;
        uint256 maxAssets = maxDeposit(receiver);
        if (assets > maxAssets) revert ERC4626ExceededMaxDeposit(receiver, assets, maxAssets);

        // Price the shares before the wrapped ETH lands in the vault's balance.
        shares = previewDeposit(assets);
        IWETH(weth).deposit{value: assets}();
        _mint(receiver, shares);
        emit Deposit(_msgSender(), receiver, assets, shares);

        _deployToStrategy(assets);
    }

    /// @notice Redeem shares and receive native ETH.
    function redeemETH(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (weth == address(0)) revert NotWETHVault();
        _accrueFees();

        uint256 maxShares = maxRedeem(owner);
        if (shares > maxShares) revert ERC4626ExceededMaxRedeem(owner, shares, maxShares);

        assets = previewRedeem(shares);
        _withdraw(_msgSender(), address(this), owner, assets, shares);
        IWETH(weth).withdraw(assets);
        Address.sendValue(payable(receiver), assets);
    }

    /// @notice Settle pending fees. Anyone may call it; it only updates bookkeeping.
    function harvest() external nonReentrant {
        _accrueFees();
    }

    receive() external payable {
        if (msg.sender != weth) revert OnlyWETH();
    }

    // ---------------------------------------------------------------------
    // Admin (timelock)
    // ---------------------------------------------------------------------

    /// @notice Move all funds from the current strategy into `newStrategy` (zero = keep funds idle).
    function setStrategy(IStrategy newStrategy) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newStrategy) != address(0)) {
            if (newStrategy.asset() != asset() || newStrategy.vault() != address(this)) {
                revert StrategyMismatch();
            }
        }
        _accrueFees();

        IStrategy old = strategy;
        if (address(old) != address(0)) old.withdrawAll();
        strategy = newStrategy;
        emit StrategyUpdated(address(old), address(newStrategy));

        if (!paused()) _deployToStrategy(IERC20(asset()).balanceOf(address(this)));
    }

    /// @notice Put idle funds (e.g. after an emergency withdraw) back to work.
    function deployIdle() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _deployToStrategy(IERC20(asset()).balanceOf(address(this)));
    }

    function setFees(uint256 performanceFee_, uint256 managementFee_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _accrueFees();
        _setFees(performanceFee_, managementFee_);
    }

    function setFeeRecipient(address feeRecipient_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _accrueFees();
        _setFeeRecipient(feeRecipient_);
    }

    function setDepositCaps(uint256 depositCap_, uint256 userDepositCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositCap = depositCap_;
        userDepositCap = userDepositCap_;
        emit DepositCapsUpdated(depositCap_, userDepositCap_);
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Guardian (multisig, fast)
    // ---------------------------------------------------------------------

    /// @notice Stop new deposits. Withdrawals stay open.
    function pause() external onlyRole(GUARDIAN_ROLE) {
        _pause();
    }

    /// @notice Pause and pull everything out of the strategy into the vault.
    function emergencyWithdraw() external nonReentrant onlyRole(GUARDIAN_ROLE) {
        if (!paused()) _pause();
        IStrategy s = strategy;
        uint256 amount = address(s) == address(0) ? 0 : s.withdrawAll();
        emit EmergencyWithdraw(amount);
    }

    // ---------------------------------------------------------------------
    // Internals
    // ---------------------------------------------------------------------

    function _decimalsOffset() internal pure override returns (uint8) {
        return DECIMALS_OFFSET;
    }

    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        super._deposit(caller, receiver, assets, shares);
        _deployToStrategy(assets);
    }

    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares)
        internal
        override
    {
        uint256 idle = IERC20(asset()).balanceOf(address(this));
        IStrategy s = strategy;
        if (idle < assets && address(s) != address(0)) s.withdraw(assets - idle);
        super._withdraw(caller, receiver, owner, assets, shares);
    }

    function _deployToStrategy(uint256 amount) internal {
        IStrategy s = strategy;
        if (address(s) == address(0) || amount == 0) return;
        IERC20(asset()).safeTransfer(address(s), amount);
        s.deposit(amount);
    }

    /// @dev Same virtual-share math OpenZeppelin uses in `_convertToAssets`, for one whole share.
    function _pricePerShare(uint256 assets, uint256 supply) internal view returns (uint256) {
        return (10 ** decimals()).mulDiv(assets + 1, supply + 10 ** _decimalsOffset());
    }

    function _accrueFees() internal {
        uint256 supply = totalSupply();
        uint256 assets = totalAssets();
        uint256 elapsed = block.timestamp - lastFeeAccrual;
        lastFeeAccrual = block.timestamp;

        // Empty vault: start fresh so the next depositors are measured from their own entry price.
        if (supply == 0) {
            highWaterMark = _pricePerShare(assets, 0);
            return;
        }

        uint256 pps = _pricePerShare(assets, supply);
        uint256 feeAssets = assets.mulDiv(managementFee * elapsed, MAX_BPS * YEAR);

        bool newHigh = pps > highWaterMark;
        if (newHigh) {
            uint256 profit = (pps - highWaterMark).mulDiv(supply, 10 ** decimals());
            feeAssets += profit.mulDiv(performanceFee, MAX_BPS);
        }

        if (feeAssets > 0 && feeAssets < assets) {
            // Mint shares so the recipient owns exactly `feeAssets` of the vault afterwards.
            uint256 feeShares = feeAssets.mulDiv(supply + 10 ** _decimalsOffset(), assets + 1 - feeAssets);
            if (feeShares > 0) {
                _mint(feeRecipient, feeShares);
                supply += feeShares;
            }
            emit FeesAccrued(feeAssets, feeShares, _pricePerShare(assets, supply));
        }

        if (newHigh) {
            uint256 ppsAfterFees = _pricePerShare(assets, supply);
            if (ppsAfterFees > highWaterMark) highWaterMark = ppsAfterFees;
        }
    }

    function _setFees(uint256 performanceFee_, uint256 managementFee_) internal {
        if (performanceFee_ > MAX_PERFORMANCE_FEE || managementFee_ > MAX_MANAGEMENT_FEE) revert FeeTooHigh();
        performanceFee = performanceFee_;
        managementFee = managementFee_;
        emit FeesUpdated(performanceFee_, managementFee_);
    }

    function _setFeeRecipient(address feeRecipient_) internal {
        if (feeRecipient_ == address(0)) revert ZeroAddress();
        feeRecipient = feeRecipient_;
        emit FeeRecipientUpdated(feeRecipient_);
    }
}
