// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TokenMigrater
 * @dev Contract for migrating source tokens to target tokens at 1:1 ratio
 * Features:
 * - 1:1 migration ratio from source to target tokens
 * - Default migration limit for all wallets
 * - Treasury wallet to hold migrated source tokens
 * - Decimal verification to ensure tokens are compatible
 * - Pausable functionality
 * - Owner-only administrative functions
 */
contract TokenMigrater is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // Token contracts
    IERC20 public immutable sourceToken;
    IERC20 public immutable targetToken;

    // Treasury wallet to receive source tokens
    address public treasuryWallet;

    // Migration settings
    bool public migrationPaused;
    uint256 public defaultMigrationLimit;

    // Track migrated amounts per wallet
    mapping(address => uint256) public walletMigratedAmount;

    // Events
    event Migration(
        address indexed user,
        uint256 sourceAmount,
        uint256 targetAmount
    );
    event MigrationPaused(bool paused);
    event TreasuryWalletUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event DefaultMigrationLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event EmergencyWithdraw(
        address indexed token,
        uint256 amount,
        address indexed to
    );

    // Custom errors
    error MigrationIsPaused();
    error InvalidAmount();
    error InsufficientTargetBalance();
    error MigrationLimitExceeded();
    error InvalidTreasuryWallet();
    error TransferFailed();
    error DecimalMismatch();

    /**
     * @dev Constructor
     * @param _sourceToken Address of the source token contract (IAI)
     * @param _targetToken Address of the target token contract (VRFI)
     * @param _treasuryWallet Address of the treasury wallet to receive source tokens
     * @param _defaultMigrationLimit Default migration limit per wallet
     * @param _initialOwner Initial owner of the contract
     */
    constructor(
        address _sourceToken,
        address _targetToken,
        address _treasuryWallet,
        uint256 _defaultMigrationLimit,
        address _initialOwner
    ) Ownable(_initialOwner) {
        require(
            _sourceToken != address(0),
            "TokenMigrater: Source token address cannot be zero"
        );
        require(
            _targetToken != address(0),
            "TokenMigrater: Target token address cannot be zero"
        );
        require(
            _treasuryWallet != address(0),
            "TokenMigrater: Treasury wallet cannot be zero"
        );
        require(
            _initialOwner != address(0),
            "TokenMigrater: Initial owner cannot be zero"
        );

        // Verify that both tokens have the same decimals
        uint8 sourceDecimals = IERC20Metadata(_sourceToken).decimals();
        uint8 targetDecimals = IERC20Metadata(_targetToken).decimals();
        if (sourceDecimals != targetDecimals) revert DecimalMismatch();

        sourceToken = IERC20(_sourceToken);
        targetToken = IERC20(_targetToken);
        treasuryWallet = _treasuryWallet;
        defaultMigrationLimit = _defaultMigrationLimit;
        migrationPaused = false;
    }

    /**
     * @dev Migrate source tokens to target tokens at 1:1 ratio
     * @param amount Amount of source tokens to migrate
     */
    function migrate(uint256 amount) external nonReentrant {
        if (migrationPaused) revert MigrationIsPaused();
        if (amount == 0) revert InvalidAmount();

        address user = msg.sender;

        // Check migration limit
        if (walletMigratedAmount[user] + amount > defaultMigrationLimit) {
            revert MigrationLimitExceeded();
        }

        // Check if contract has enough target tokens
        uint256 contractTargetBalance = targetToken.balanceOf(address(this));
        if (contractTargetBalance < amount) revert InsufficientTargetBalance();

        // Update migrated amount
        walletMigratedAmount[user] += amount;

        // Transfer source tokens from user to treasury
        sourceToken.safeTransferFrom(user, treasuryWallet, amount);

        // Transfer target tokens to user
        targetToken.safeTransfer(user, amount);

        emit Migration(user, amount, amount);
    }

    /**
     * @dev Get remaining migration amount for a user
     * @param user User address
     * @return Remaining migration amount
     */
    function getRemainingMigrationAmount(
        address user
    ) external view returns (uint256) {
        uint256 migratedAmount = walletMigratedAmount[user];
        return
            defaultMigrationLimit > migratedAmount
                ? defaultMigrationLimit - migratedAmount
                : 0;
    }

    /**
     * @dev Check if migration is available for a user with specific amount
     * @param user User address
     * @param amount Amount to check
     * @return Whether migration is available
     */
    function canMigrate(
        address user,
        uint256 amount
    ) external view returns (bool) {
        if (migrationPaused || amount == 0) return false;

        if (walletMigratedAmount[user] + amount > defaultMigrationLimit)
            return false;

        uint256 contractTargetBalance = targetToken.balanceOf(address(this));
        if (contractTargetBalance < amount) return false;

        return true;
    }

    // Admin functions

    /**
     * @dev Pause or unpause migration
     * @param _paused True to pause, false to unpause
     */
    function pauseMigration(bool _paused) external onlyOwner {
        migrationPaused = _paused;
        emit MigrationPaused(_paused);
    }

    /**
     * @dev Set treasury wallet address
     * @param _treasuryWallet New treasury wallet address
     */
    function setTreasuryWallet(address _treasuryWallet) external onlyOwner {
        if (_treasuryWallet == address(0)) revert InvalidTreasuryWallet();

        address oldTreasury = treasuryWallet;
        treasuryWallet = _treasuryWallet;
        emit TreasuryWalletUpdated(oldTreasury, _treasuryWallet);
    }

    /**
     * @dev Set default migration limit
     * @param _defaultMigrationLimit New default migration limit
     */
    function setDefaultMigrationLimit(
        uint256 _defaultMigrationLimit
    ) external onlyOwner {
        uint256 oldLimit = defaultMigrationLimit;
        defaultMigrationLimit = _defaultMigrationLimit;
        emit DefaultMigrationLimitUpdated(oldLimit, _defaultMigrationLimit);
    }

    /**
     * @dev Emergency function to withdraw tokens from the contract
     * @param token Token address to withdraw
     * @param amount Amount to withdraw
     * @param to Recipient address
     */
    function emergencyWithdraw(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        require(
            token != address(0),
            "TokenMigrater: Token address cannot be zero"
        );
        require(
            to != address(0),
            "TokenMigrater: Recipient address cannot be zero"
        );
        require(amount > 0, "TokenMigrater: Amount must be greater than zero");

        IERC20(token).safeTransfer(to, amount);
        emit EmergencyWithdraw(token, amount, to);
    }

    /**
     * @dev Get contract information
     * @return isPaused Whether migration is paused
     * @return targetBalance Target token balance in the contract
     * @return defaultLimit Default migration limit
     * @return treasury Treasury wallet address
     */
    function getContractInfo()
        external
        view
        returns (
            bool isPaused,
            uint256 targetBalance,
            uint256 defaultLimit,
            address treasury
        )
    {
        return (
            migrationPaused,
            targetToken.balanceOf(address(this)),
            defaultMigrationLimit,
            treasuryWallet
        );
    }
}
