// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {IStrategy} from "./interfaces/IStrategy.sol";
import {ISwapper} from "./interfaces/ISwapper.sol";
import {IWETH} from "./interfaces/IWETH.sol";

/// @title BtcYieldVault
/// @notice Users deposit an asset (e.g. USDC or WETH) and can always withdraw exactly that amount
/// again. Only the yield is converted into a reward token (cbBTC) and paid out.
///
/// How the yield is shared fairly:
///  1. Before every deposit, withdrawal or share transfer the vault "realizes" the yield earned so
///     far and credits it to the current holders, per share, still in the deposit asset. A new
///     depositor therefore never gets yield that was earned before they joined.
///  2. A keeper periodically calls `harvest`, which swaps all credited yield into cbBTC in one go.
///     The swap closes an "epoch"; every holder's credit from that epoch converts at that epoch's
///     rate. Credits earned after the harvest wait for the next one.
///  3. Users call `claim` whenever they like to receive their cbBTC.
///
/// Shares are 1:1 with deposited principal (same decimals as the asset). If the strategy ever loses
/// money, withdrawals are reduced pro rata and harvesting stops until the deficit is gone.
///
/// Roles: DEFAULT_ADMIN_ROLE (timelock) changes strategy, swapper, fees and caps; GUARDIAN_ROLE
/// (multisig) can pause deposits and pull funds out of the strategy; KEEPER_ROLE may harvest.
/// Withdrawals and claims stay open while paused.
contract BtcYieldVault is ERC20, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using Math for uint256;

    bytes32 public constant GUARDIAN_ROLE = keccak256("GUARDIAN_ROLE");
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");

    uint256 public constant MAX_BPS = 10_000;
    /// @notice Performance fee can never exceed 20% of the yield.
    uint256 public constant MAX_PERFORMANCE_FEE = 2_000;
    /// @dev Scale of the per-share accumulators.
    uint256 private constant ACC = 1e18;
    /// @dev Scale of the yield -> reward conversion rate of an epoch.
    uint256 private constant RATE = 1e36;
    /// @dev Yield (in asset units) always left unrealized. Strategies such as Aave round balances
    /// down by a unit here and there; this cushion keeps those rounding losses away from principal.
    uint256 private constant ROUNDING_BUFFER = 10;

    IERC20 public immutable asset;
    IERC20 public immutable rewardToken;
    /// @notice WETH address if the asset is WETH (enables native ETH), otherwise zero.
    address public immutable weth;
    uint8 private immutable _decimals;

    IStrategy public strategy;
    ISwapper public swapper;
    address public feeRecipient;
    uint256 public performanceFee;
    uint256 public depositCap;
    uint256 public userDepositCap;
    /// @notice Harvests below this amount of yield revert, so dust is not swapped at a loss.
    uint256 public minHarvest;

    /// @notice Cumulative realized yield per share, in asset units scaled by 1e18.
    uint256 public accYieldPerShare;
    /// @notice Realized yield (asset) waiting for the next harvest. Includes `protocolYield`.
    uint256 public pendingYield;
    /// @notice Yield earned while the vault had no shares; its rewards go to `feeRecipient`.
    uint256 public protocolYield;
    /// @notice Number of completed harvests; the current epoch is still accruing.
    uint256 public epoch;

    struct Epoch {
        uint256 accYieldEnd; // accYieldPerShare when the epoch was harvested
        uint256 rate; // reward units per asset unit of yield, scaled by 1e36
        uint256 accRewardEnd; // cumulative reward per share up to the end of this epoch, scaled by 1e18
    }

    struct Account {
        uint256 accYield; // accYieldPerShare at the last checkpoint
        uint256 epoch; // epoch of the last checkpoint
        uint256 yieldCredit; // yield (asset) credited in `epoch`, converted once that epoch is harvested
        uint256 rewards; // claimable reward tokens
    }

    mapping(uint256 => Epoch) public epochs;
    mapping(address => Account) public accounts;

    event Deposit(address indexed caller, address indexed receiver, uint256 assets);
    event Withdraw(address indexed caller, address indexed receiver, address indexed owner, uint256 shares, uint256 assets);
    event Claim(address indexed user, address indexed receiver, uint256 rewards);
    event Harvest(uint256 indexed epoch, uint256 yieldSwapped, uint256 rewardsOut, uint256 fee, uint256 userRewards);
    event StrategyUpdated(address indexed oldStrategy, address indexed newStrategy);
    event SwapperUpdated(address indexed swapper);
    event FeeUpdated(uint256 performanceFee);
    event FeeRecipientUpdated(address indexed feeRecipient);
    event DepositCapsUpdated(uint256 depositCap, uint256 userDepositCap);
    event MinHarvestUpdated(uint256 minHarvest);
    event EmergencyWithdraw(uint256 amount);

    error ZeroAddress();
    error ZeroAmount();
    error FeeTooHigh();
    error SameToken();
    error StrategyMismatch();
    error ExceedsDepositCap(uint256 assets, uint256 max);
    error NothingToHarvest();
    error Deficit();
    error NotWETHVault();
    error OnlyWETH();

    struct Config {
        IERC20 asset;
        IERC20 rewardToken;
        string name;
        string symbol;
        address admin;
        address guardian;
        address keeper;
        address feeRecipient;
        uint256 performanceFee;
        address weth;
    }

    constructor(Config memory c) ERC20(c.name, c.symbol) {
        if (c.admin == address(0) || c.guardian == address(0) || c.keeper == address(0)) revert ZeroAddress();
        if (address(c.asset) == address(c.rewardToken)) revert SameToken();
        if (c.weth != address(0) && c.weth != address(c.asset)) revert NotWETHVault();

        asset = c.asset;
        rewardToken = c.rewardToken;
        weth = c.weth;
        _decimals = IERC20Metadata(address(c.asset)).decimals();

        _grantRole(DEFAULT_ADMIN_ROLE, c.admin);
        _grantRole(GUARDIAN_ROLE, c.guardian);
        _grantRole(KEEPER_ROLE, c.keeper);

        _setFeeRecipient(c.feeRecipient);
        _setPerformanceFee(c.performanceFee);
        depositCap = type(uint256).max;
        userDepositCap = type(uint256).max;
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Everything the vault controls in the deposit asset (idle + strategy).
    function totalAssets() public view returns (uint256) {
        uint256 idle = asset.balanceOf(address(this));
        IStrategy s = strategy;
        return address(s) == address(0) ? idle : idle + s.totalAssets();
    }

    /// @notice Yield earned but not yet credited to anyone (credited on the next interaction).
    function unrealizedYield() public view returns (uint256) {
        uint256 total = totalAssets();
        uint256 owed = totalSupply() + pendingYield + ROUNDING_BUFFER;
        return total > owed ? total - owed : 0;
    }

    /// @notice What `shares` can be withdrawn for right now (equal to `shares` unless there is a loss).
    function previewWithdraw(uint256 shares) public view returns (uint256) {
        return _principalValue(shares, totalAssets());
    }

    function maxDeposit(address receiver) public view returns (uint256) {
        if (paused()) return 0;
        uint256 supply = totalSupply();
        uint256 vaultRoom = depositCap > supply ? depositCap - supply : 0;
        uint256 held = balanceOf(receiver);
        uint256 userRoom = userDepositCap > held ? userDepositCap - held : 0;
        return Math.min(vaultRoom, userRoom);
    }

    /// @notice A user's position for the UI.
    /// @return claimable reward tokens that can be claimed now
    /// @return pendingCredit yield (asset) credited to the user that converts on the next harvest,
    ///         including their share of yield not yet realized
    function positionOf(address user) external view returns (uint256 claimable, uint256 pendingCredit) {
        uint256 acc = accYieldPerShare;
        uint256 supply = totalSupply();
        if (supply > 0) acc += unrealizedYield().mulDiv(ACC, supply);
        Account memory a = accounts[user];
        (claimable, pendingCredit) = _settle(a, balanceOf(user), acc, epoch);
    }

    // ---------------------------------------------------------------------
    // User actions
    // ---------------------------------------------------------------------

    function deposit(uint256 assets, address receiver) external nonReentrant returns (uint256) {
        _checkDeposit(assets, receiver);
        _realizeYield();
        asset.safeTransferFrom(msg.sender, address(this), assets);
        _mint(receiver, assets);
        _deployToStrategy(assets);
        emit Deposit(msg.sender, receiver, assets);
        return assets;
    }

    /// @notice Deposit native ETH (wrapped to WETH). Only for WETH vaults.
    function depositETH(address receiver) external payable nonReentrant returns (uint256) {
        if (weth == address(0)) revert NotWETHVault();
        uint256 assets = msg.value;
        _checkDeposit(assets, receiver);
        // Realize before the wrapped ETH shows up in the balance, or it would count as yield.
        _realizeYield();
        IWETH(weth).deposit{value: assets}();
        _mint(receiver, assets);
        _deployToStrategy(assets);
        emit Deposit(msg.sender, receiver, assets);
        return assets;
    }

    /// @notice Burn `shares` of `owner` and send the principal to `receiver`. Rewards stay claimable.
    function withdraw(uint256 shares, address receiver, address owner) external nonReentrant returns (uint256 assets) {
        assets = _withdraw(shares, owner);
        asset.safeTransfer(receiver, assets);
        emit Withdraw(msg.sender, receiver, owner, shares, assets);
    }

    /// @notice Like `withdraw`, but pays out native ETH. Only for WETH vaults.
    function withdrawETH(uint256 shares, address receiver, address owner)
        external
        nonReentrant
        returns (uint256 assets)
    {
        if (weth == address(0)) revert NotWETHVault();
        assets = _withdraw(shares, owner);
        IWETH(weth).withdraw(assets);
        Address.sendValue(payable(receiver), assets);
        emit Withdraw(msg.sender, receiver, owner, shares, assets);
    }

    /// @notice Send all claimable reward tokens of the caller to `receiver`.
    function claim(address receiver) external nonReentrant returns (uint256 amount) {
        _checkpoint(msg.sender);
        Account storage a = accounts[msg.sender];
        amount = a.rewards;
        a.rewards = 0;
        if (amount > 0) rewardToken.safeTransfer(receiver, amount);
        emit Claim(msg.sender, receiver, amount);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        _realizeYield();
        return super.transfer(to, value);
    }

    function transferFrom(address from, address to, uint256 value) public override returns (bool) {
        _realizeYield();
        return super.transferFrom(from, to, value);
    }

    receive() external payable {
        if (msg.sender != weth) revert OnlyWETH();
    }

    // ---------------------------------------------------------------------
    // Keeper
    // ---------------------------------------------------------------------

    /// @notice Swap all credited yield into reward tokens and close the current epoch.
    /// @param minRewardsOut Keeper's own slippage limit; the swapper also enforces an oracle floor.
    function harvest(uint256 minRewardsOut) external nonReentrant onlyRole(KEEPER_ROLE) returns (uint256 out) {
        _realizeYield();
        uint256 yield_ = pendingYield;
        if (yield_ == 0 || yield_ < minHarvest) revert NothingToHarvest();
        if (totalAssets() < totalSupply() + yield_) revert Deficit();

        _pull(yield_);
        uint256 before = rewardToken.balanceOf(address(this));
        asset.forceApprove(address(swapper), yield_);
        swapper.swap(address(asset), address(rewardToken), yield_, minRewardsOut, address(this));
        out = rewardToken.balanceOf(address(this)) - before;

        uint256 fee = out.mulDiv(performanceFee, MAX_BPS);
        uint256 protocolPart = (out - fee).mulDiv(protocolYield, yield_);
        uint256 userRewards = out - fee - protocolPart;
        uint256 userYield = yield_ - protocolYield;
        if (fee + protocolPart > 0) rewardToken.safeTransfer(feeRecipient, fee + protocolPart);

        uint256 e = epoch;
        (uint256 prevAccYield, uint256 prevAccReward) = _epochStart(e);
        uint256 rate = userYield == 0 ? 0 : userRewards.mulDiv(RATE, userYield);
        epochs[e] = Epoch({
            accYieldEnd: accYieldPerShare,
            rate: rate,
            accRewardEnd: prevAccReward + (accYieldPerShare - prevAccYield).mulDiv(rate, RATE)
        });

        pendingYield = 0;
        protocolYield = 0;
        epoch = e + 1;
        emit Harvest(e, yield_, out, fee, userRewards);
    }

    // ---------------------------------------------------------------------
    // Admin (timelock)
    // ---------------------------------------------------------------------

    function setStrategy(IStrategy newStrategy) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newStrategy) != address(0)) {
            if (newStrategy.asset() != address(asset) || newStrategy.vault() != address(this)) {
                revert StrategyMismatch();
            }
        }
        _realizeYield();
        IStrategy old = strategy;
        if (address(old) != address(0)) old.withdrawAll();
        strategy = newStrategy;
        emit StrategyUpdated(address(old), address(newStrategy));
        if (!paused()) _deployToStrategy(asset.balanceOf(address(this)));
    }

    function setSwapper(ISwapper newSwapper) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (address(newSwapper) == address(0)) revert ZeroAddress();
        swapper = newSwapper;
        emit SwapperUpdated(address(newSwapper));
    }

    function deployIdle() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) whenNotPaused {
        _deployToStrategy(asset.balanceOf(address(this)));
    }

    function setPerformanceFee(uint256 fee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setPerformanceFee(fee);
    }

    function setFeeRecipient(address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setFeeRecipient(recipient);
    }

    function setDepositCaps(uint256 depositCap_, uint256 userDepositCap_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        depositCap = depositCap_;
        userDepositCap = userDepositCap_;
        emit DepositCapsUpdated(depositCap_, userDepositCap_);
    }

    function setMinHarvest(uint256 minHarvest_) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minHarvest = minHarvest_;
        emit MinHarvestUpdated(minHarvest_);
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // ---------------------------------------------------------------------
    // Guardian (multisig)
    // ---------------------------------------------------------------------

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

    /// @dev Settle rewards of both sides before balances change (mint, burn, transfer).
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0)) _checkpoint(from);
        if (to != address(0) && to != from) _checkpoint(to);
        super._update(from, to, value);
    }

    function _checkDeposit(uint256 assets, address receiver) internal view {
        if (assets == 0) revert ZeroAmount();
        uint256 max = maxDeposit(receiver);
        if (assets > max) revert ExceedsDepositCap(assets, max);
    }

    function _withdraw(uint256 shares, address owner) internal returns (uint256 assets) {
        if (shares == 0) revert ZeroAmount();
        if (msg.sender != owner) _spendAllowance(owner, msg.sender, shares);
        _realizeYield();
        assets = _principalValue(shares, totalAssets());
        _burn(owner, shares);
        _pull(assets);
    }

    /// @dev Credit yield earned since the last call to the current holders.
    function _realizeYield() internal {
        uint256 yield_ = unrealizedYield();
        if (yield_ == 0) return;
        uint256 supply = totalSupply();

        if (supply == 0) {
            protocolYield += yield_;
            pendingYield += yield_;
            return;
        }
        uint256 delta = yield_.mulDiv(ACC, supply);
        if (delta == 0) return;
        accYieldPerShare += delta;
        // Book exactly what holders can claim; the rounding remainder is realized next time.
        pendingYield += delta.mulDiv(supply, ACC);
    }

    function _checkpoint(address user) internal {
        Account storage a = accounts[user];
        (uint256 rewards, uint256 credit) = _settle(a, balanceOf(user), accYieldPerShare, epoch);
        a.rewards = rewards;
        a.yieldCredit = credit;
        a.accYield = accYieldPerShare;
        a.epoch = epoch;
    }

    /// @dev Bring an account up to date: convert credits of harvested epochs into rewards and
    /// return the credit that still belongs to the current epoch `e`.
    function _settle(Account memory a, uint256 shares, uint256 acc, uint256 e)
        internal
        view
        returns (uint256 rewards, uint256 credit)
    {
        rewards = a.rewards;
        if (a.epoch == e) {
            return (rewards, a.yieldCredit + shares.mulDiv(acc - a.accYield, ACC));
        }

        // Rest of the epoch the account was last seen in, at that epoch's rate.
        Epoch memory first = epochs[a.epoch];
        uint256 firstCredit = a.yieldCredit + shares.mulDiv(first.accYieldEnd - a.accYield, ACC);
        rewards += firstCredit.mulDiv(first.rate, RATE);

        // Full epochs in between, via the cumulative reward per share.
        Epoch memory last = epochs[e - 1];
        rewards += shares.mulDiv(last.accRewardEnd - first.accRewardEnd, ACC);

        // Yield credited since the last harvest.
        credit = shares.mulDiv(acc - last.accYieldEnd, ACC);
    }

    function _epochStart(uint256 e) internal view returns (uint256 accYield, uint256 accReward) {
        if (e == 0) return (0, 0);
        Epoch memory prev = epochs[e - 1];
        return (prev.accYieldEnd, prev.accRewardEnd);
    }

    function _principalValue(uint256 shares, uint256 total) internal view returns (uint256) {
        uint256 supply = totalSupply();
        uint256 available = total > pendingYield ? total - pendingYield : 0;
        return available >= supply ? shares : shares.mulDiv(available, supply);
    }

    function _pull(uint256 amount) internal {
        uint256 idle = asset.balanceOf(address(this));
        IStrategy s = strategy;
        if (idle < amount && address(s) != address(0)) s.withdraw(amount - idle);
    }

    function _deployToStrategy(uint256 amount) internal {
        IStrategy s = strategy;
        if (address(s) == address(0) || amount == 0) return;
        asset.safeTransfer(address(s), amount);
        s.deposit(amount);
    }

    function _setPerformanceFee(uint256 fee) internal {
        if (fee > MAX_PERFORMANCE_FEE) revert FeeTooHigh();
        performanceFee = fee;
        emit FeeUpdated(fee);
    }

    function _setFeeRecipient(address recipient) internal {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }
}
