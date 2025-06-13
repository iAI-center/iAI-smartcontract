// SPDX-License-Identifier: MIT
/**
 * @title SmartChefInitializableV3
 * @dev A staking pool contract that allows users to stake tokens and earn rewards
 * @dev V3 version includes deposit IDs, lock periods, and improved tracking
 */
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// Legacy imports replaced with OpenZeppelin equivalents
// import "bsc-library/contracts/ERC20.sol";
// import "bsc-library/contracts/SafeBEP20.sol";

contract SmartChefInitializableV3 is Ownable, ReentrancyGuard {
    using SafeERC20 for ERC20;

    // Address of the smart chef factory that deployed this contract
    address public SMART_CHEF_FACTORY;

    // Flag indicating whether a per-user staking limit is enforced
    bool public hasUserLimit;

    // Flag indicating whether the contract has been initialized
    bool public isInitialized;

    // Accumulated reward tokens per share, scaled by PRECISION_FACTOR
    uint256 public accTokenPerShare;

    // Block number when the reward period ends
    uint256 public bonusEndBlock;

    // Block number when the reward period begins
    uint256 public startBlock;

    // Last block number where rewards were calculated
    uint256 public lastRewardBlock;

    // Maximum amount of tokens a user can stake (0 if no limit)
    uint256 public poolLimitPerUser;

    // Amount of reward tokens created per block
    uint256 public rewardPerBlock;

    // Used to handle decimal precision differences between staked and reward tokens
    uint256 public PRECISION_FACTOR;

    // Token distributed as rewards to stakers
    ERC20 public rewardToken;

    // Token that users stake in this contract
    ERC20 public stakedToken;

    // Total amount of tokens staked in the contract
    uint256 public totalStakedSupply;

    // Time period in seconds that deposits are locked before rewards can be claimed (0 means no lock)
    uint256 public lockPeriod;

    // Incremental ID counter for deposits, starting from 1
    uint256 public nextDepositId;

    // Mapping from deposit ID to deposit information
    mapping(uint256 => DepositInfo) public deposits;

    // Mapping from user address to their deposit IDs
    mapping(address => uint256[]) public userDepositIds;

    // Mapping from user address to their total staked amount across all deposits
    mapping(address => uint256) public userTotalStaked;

    struct DepositInfo {
        address user; // Address of the deposit owner
        uint256 amount; // Amount of staked tokens in this deposit
        uint256 rewardDebt; // Used for accurate reward calculation
        uint256 depositTime; // Block timestamp when the deposit was created
        bool active; // Whether this deposit is still active or has been withdrawn
    }

    event AdminTokenRecovery(address tokenRecovered, uint256 amount);
    event Deposit(address indexed user, uint256 depositId, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event NewStartAndEndBlocks(uint256 startBlock, uint256 endBlock);
    event NewRewardPerBlock(uint256 rewardPerBlock);
    event NewPoolLimit(uint256 poolLimitPerUser);
    event RewardsStop(uint256 blockNumber);
    event Withdraw(address indexed user, uint256 depositId, uint256 amount);
    event LockPeriodUpdated(uint256 oldLockPeriod, uint256 newLockPeriod);

    /**
     * @notice Initializes the contract with basic settings
     * @dev Sets the factory address and starts deposit IDs from 1
     */
    constructor() Ownable(_msgSender()) {
        SMART_CHEF_FACTORY = msg.sender;
        nextDepositId = 1; // Start deposit IDs from 1
    }

    /**
     * @notice Initializes the staking pool with all required parameters
     * @dev Can only be called once by the factory that deployed this contract
     * @param _stakedToken Address of the token that users will stake
     * @param _rewardToken Address of the token distributed as rewards
     * @param _rewardPerBlock Amount of reward tokens distributed per block
     * @param _startBlock Block number when reward distribution starts
     * @param _bonusEndBlock Block number when reward distribution ends
     * @param _poolLimitPerUser Maximum amount a user can stake (0 for no limit)
     * @param _lockPeriod Time in seconds deposits are locked before rewards can be claimed (0 for no lock)
     * @param _admin Address that will receive ownership of the contract
     */
    function initialize(
        address _stakedToken,
        address _rewardToken,
        uint256 _rewardPerBlock,
        uint256 _startBlock,
        uint256 _bonusEndBlock,
        uint256 _poolLimitPerUser,
        uint256 _lockPeriod,
        address _admin
    ) external {
        require(!isInitialized, "Already initialized");
        require(msg.sender == SMART_CHEF_FACTORY, "Not factory");
        require(
            _startBlock < _bonusEndBlock,
            "startBlock must be lower than endBlock"
        );
        require(_admin != address(0), "Admin cannot be zero address");
        require(
            _stakedToken != address(0) && _rewardToken != address(0),
            "Token addresses cannot be zero"
        );

        stakedToken = ERC20(_stakedToken);
        rewardToken = ERC20(_rewardToken);

        // Calculate and validate total rewards
        uint256 totalBlocks = _bonusEndBlock - _startBlock;
        uint256 totalRewardsNeeded = totalBlocks * _rewardPerBlock;
        require(
            ERC20(_rewardToken).balanceOf(address(this)) >= totalRewardsNeeded,
            "Insufficient reward tokens provided"
        );

        isInitialized = true;

        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;

        if (_poolLimitPerUser > 0) {
            hasUserLimit = true;
            poolLimitPerUser = _poolLimitPerUser;
        }

        // Set lock period
        lockPeriod = _lockPeriod;

        uint256 decimalsRewardToken = uint256(rewardToken.decimals());
        require(decimalsRewardToken < 30, "Must be inferior to 30");

        PRECISION_FACTOR = uint256(10 ** (30 - decimalsRewardToken));

        // Set the lastRewardBlock as the startBlock
        lastRewardBlock = startBlock;

        // Transfer ownership to the admin address who becomes owner of the contract
        transferOwnership(_admin);
    }

    /**
     * @notice Creates a new stake by depositing tokens
     * @dev Updates reward calculations before processing the deposit
     * @param _amount Amount of tokens to deposit (in stakedToken)
     * @return depositId Unique identifier for the created deposit
     */
    function deposit(uint256 _amount) external nonReentrant returns (uint256) {
        require(isInitialized, "Pool not initialized");
        require(_amount > 0, "Amount must be greater than 0");

        if (hasUserLimit) {
            require(
                _amount + userTotalStaked[msg.sender] <= poolLimitPerUser,
                "User amount above limit"
            );
        }

        _updatePool();

        // Create new deposit
        uint256 depositId = nextDepositId++;
        deposits[depositId] = DepositInfo({
            user: msg.sender,
            amount: _amount,
            rewardDebt: (_amount * accTokenPerShare) / PRECISION_FACTOR,
            depositTime: block.timestamp,
            active: true
        });

        // Update user tracking
        userDepositIds[msg.sender].push(depositId);
        userTotalStaked[msg.sender] += _amount;
        totalStakedSupply += _amount;

        stakedToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Deposit(msg.sender, depositId, _amount);
        return depositId;
    }

    /**
     * @notice Withdraws staked tokens and collects earned rewards from a specific deposit
     * @dev Rewards are only distributed if the lock period has passed
     * @param _depositId ID of the specific deposit to withdraw from
     */
    function withdraw(uint256 _depositId) external nonReentrant {
        require(isInitialized, "Pool not initialized");
        DepositInfo storage depositInfo = deposits[_depositId];
        require(depositInfo.user == msg.sender, "Not your deposit");
        require(depositInfo.active, "Deposit not active");
        require(depositInfo.amount > 0, "No amount to withdraw");

        _updatePool();

        uint256 pending = ((depositInfo.amount * accTokenPerShare) /
            PRECISION_FACTOR) - depositInfo.rewardDebt;

        // Only give rewards if lock period has passed
        bool canReceiveRewards = lockPeriod == 0 ||
            block.timestamp >= depositInfo.depositTime + lockPeriod;

        uint256 amountToWithdraw = depositInfo.amount;

        // Update state
        depositInfo.amount = 0;
        depositInfo.active = false;
        depositInfo.rewardDebt = 0;
        userTotalStaked[msg.sender] -= amountToWithdraw;
        totalStakedSupply -= amountToWithdraw;

        // Transfer tokens
        stakedToken.safeTransfer(msg.sender, amountToWithdraw);

        if (pending > 0 && canReceiveRewards) {
            rewardToken.safeTransfer(msg.sender, pending);
        }

        emit Withdraw(msg.sender, _depositId, amountToWithdraw);
    }

    /**
     * @notice Emergency function to withdraw all staked tokens without receiving rewards
     * @dev Used in emergency situations where quick withdrawal is necessary
     * @dev Withdraws from all active deposits for the caller
     */
    function emergencyWithdraw() external nonReentrant {
        uint256[] memory userDeposits = userDepositIds[msg.sender];
        uint256 totalAmountToTransfer = 0;

        for (uint256 i = 0; i < userDeposits.length; i++) {
            uint256 depositId = userDeposits[i];
            DepositInfo storage depositInfo = deposits[depositId];

            if (depositInfo.active && depositInfo.amount > 0) {
                totalAmountToTransfer += depositInfo.amount;
                depositInfo.amount = 0;
                depositInfo.rewardDebt = 0;
                depositInfo.active = false;
            }
        }

        userTotalStaked[msg.sender] = 0;
        totalStakedSupply -= totalAmountToTransfer;

        if (totalAmountToTransfer > 0) {
            stakedToken.safeTransfer(msg.sender, totalAmountToTransfer);
        }

        emit EmergencyWithdraw(msg.sender, totalAmountToTransfer);
    }

    /**
     * @notice Emergency function for owner to withdraw reward tokens
     * @dev Only callable by owner in emergency situations
     * @param _amount Amount of reward tokens to withdraw
     */
    function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
        rewardToken.safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice Updates the lock period for deposits
     * @dev Only callable by owner
     * @param _newLockPeriod New lock period duration in seconds
     */
    function updateLockPeriod(uint256 _newLockPeriod) external onlyOwner {
        uint256 oldLockPeriod = lockPeriod;
        lockPeriod = _newLockPeriod;
        emit LockPeriodUpdated(oldLockPeriod, _newLockPeriod);
    }

    /**
     * @notice Allows the admin to recover tokens mistakenly sent to the contract
     * @dev Cannot be used to withdraw staked tokens or reward tokens
     * @param _tokenAddress Address of the token to recover
     * @param _tokenAmount Amount of tokens to recover
     */
    function recoverWrongTokens(
        address _tokenAddress,
        uint256 _tokenAmount
    ) external onlyOwner {
        require(
            _tokenAddress != address(stakedToken),
            "Cannot be staked token"
        );
        require(
            _tokenAddress != address(rewardToken),
            "Cannot be reward token"
        );

        ERC20(_tokenAddress).safeTransfer(address(msg.sender), _tokenAmount);

        emit AdminTokenRecovery(_tokenAddress, _tokenAmount);
    }

    /**
     * @notice Immediately stops the reward distribution by setting the end block to the current block
     * @dev Only callable by owner
     */
    function stopReward() external onlyOwner {
        bonusEndBlock = block.number;
        emit RewardsStop(block.number);
    }

    /**
     * @notice Updates the maximum amount of tokens each user can stake
     * @dev Only callable by owner and only if a limit was previously set
     * @param _hasUserLimit Whether to enforce a user limit (false to remove limit)
     * @param _poolLimitPerUser New maximum stake amount per user (must be higher than current limit)
     */
    function updatePoolLimitPerUser(
        bool _hasUserLimit,
        uint256 _poolLimitPerUser
    ) external onlyOwner {
        require(hasUserLimit, "Must be set");
        if (_hasUserLimit) {
            require(
                _poolLimitPerUser > poolLimitPerUser,
                "New limit must be higher"
            );
            poolLimitPerUser = _poolLimitPerUser;
        } else {
            hasUserLimit = _hasUserLimit;
            poolLimitPerUser = 0;
        }
        emit NewPoolLimit(poolLimitPerUser);
    }

    /**
     * @notice Updates the reward amount distributed per block
     * @dev Only callable by owner before the pool has started
     * @param _rewardPerBlock New reward amount per block
     */
    function updateRewardPerBlock(uint256 _rewardPerBlock) external onlyOwner {
        require(block.number < startBlock, "Pool has started");
        rewardPerBlock = _rewardPerBlock;
        emit NewRewardPerBlock(_rewardPerBlock);
    }

    /**
     * @notice It allows the admin to update start and end blocks
     * @dev This function is only callable by owner.
     * @param _startBlock: the new start block
     * @param _bonusEndBlock: the new end block
     */
    function updateStartAndEndBlocks(
        uint256 _startBlock,
        uint256 _bonusEndBlock
    ) external onlyOwner {
        require(block.number < startBlock, "Pool has started");
        require(
            _startBlock < _bonusEndBlock,
            "New startBlock must be lower than new endBlock"
        );
        require(
            block.number < _startBlock,
            "New startBlock must be higher than current block"
        );

        startBlock = _startBlock;
        bonusEndBlock = _bonusEndBlock;

        // Set the lastRewardBlock as the startBlock
        lastRewardBlock = startBlock;

        emit NewStartAndEndBlocks(_startBlock, _bonusEndBlock);
    }

    /**
     * @notice Calculates pending reward tokens for a specific deposit
     * @dev Takes into account current block for up-to-date calculations
     * @param _depositId ID of the deposit to check
     * @return Pending reward amount for the specified deposit
     */
    function pendingReward(uint256 _depositId) external view returns (uint256) {
        DepositInfo storage depositInfo = deposits[_depositId];
        if (!depositInfo.active) return 0;

        if (block.number > lastRewardBlock && totalStakedSupply != 0) {
            uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * rewardPerBlock;
            uint256 adjustedTokenPerShare = accTokenPerShare +
                ((tokenReward * PRECISION_FACTOR) / totalStakedSupply);
            return
                ((depositInfo.amount * adjustedTokenPerShare) /
                    PRECISION_FACTOR) - depositInfo.rewardDebt;
        } else {
            return
                ((depositInfo.amount * accTokenPerShare) / PRECISION_FACTOR) -
                depositInfo.rewardDebt;
        }
    }

    /**
     * @notice Calculates total pending rewards for a user across all their deposits
     * @dev Aggregates rewards from all active deposits for the specified user
     * @param _user Address of the user to check
     * @return Total pending reward amount for the user
     */
    function pendingRewardTotal(address _user) external view returns (uint256) {
        uint256[] memory userDeposits = userDepositIds[_user];
        uint256 totalPending = 0;

        uint256 adjustedTokenPerShare = accTokenPerShare;
        if (block.number > lastRewardBlock && totalStakedSupply != 0) {
            uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
            uint256 tokenReward = multiplier * rewardPerBlock;
            adjustedTokenPerShare =
                accTokenPerShare +
                ((tokenReward * PRECISION_FACTOR) / totalStakedSupply);
        }

        for (uint256 i = 0; i < userDeposits.length; i++) {
            uint256 depositId = userDeposits[i];
            DepositInfo storage depositInfo = deposits[depositId];

            if (depositInfo.active) {
                uint256 pending = ((depositInfo.amount *
                    adjustedTokenPerShare) / PRECISION_FACTOR) -
                    depositInfo.rewardDebt;
                totalPending += pending;
            }
        }

        return totalPending;
    }

    /**
     * @notice Updates reward variables to be up-to-date with the current block
     * @dev Called before any deposit or withdrawal to ensure accurate reward calculation
     */
    function _updatePool() internal {
        if (block.number <= lastRewardBlock) {
            return;
        }

        if (totalStakedSupply == 0) {
            lastRewardBlock = block.number;
            return;
        }

        uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
        uint256 tokenReward = multiplier * rewardPerBlock;

        accTokenPerShare =
            accTokenPerShare +
            ((tokenReward * PRECISION_FACTOR) / totalStakedSupply);
        lastRewardBlock = block.number;
    }

    /**
     * @notice Calculates the reward multiplier over a block range
     * @dev Handles cases where the range extends beyond the reward end block
     * @param _from Starting block number
     * @param _to Ending block number
     * @return Number of blocks eligible for rewards
     */
    function _getMultiplier(
        uint256 _from,
        uint256 _to
    ) internal view returns (uint256) {
        if (_to <= bonusEndBlock) {
            return _to - _from;
        } else if (_from >= bonusEndBlock) {
            return 0;
        } else {
            return bonusEndBlock - _from;
        }
    }

    /**
     * @notice Gets the total amount staked by a specific user
     * @param _user Address of the user to query
     * @return Total amount staked by the user across all deposits
     */

    function getUserStakedAmount(
        address _user
    ) external view returns (uint256) {
        return userTotalStaked[_user];
    }

    /**
     * @notice Gets all deposit IDs owned by a specific user
     * @param _user Address of the user to query
     * @return Array of deposit IDs owned by the user
     */
    function getUserDepositIds(
        address _user
    ) external view returns (uint256[] memory) {
        return userDepositIds[_user];
    }

    /**
     * @notice Get user deposit IDs with pagination support
     * @param _user: user address
     * @param _startIndex: starting index for pagination
     * @param _limit: maximum number of items to return
     * @return depositIds array of deposit IDs for the specified range
     * @return total total number of deposits for the user
     */
    /**
     * @notice Gets user deposit IDs with pagination support for UIs
     * @param _user Address of the user to query
     * @param _startIndex Starting index for pagination
     * @param _limit Maximum number of items to return
     * @return depositIds Array of deposit IDs for the specified range
     * @return total Total number of deposits for the user
     */
    function getUserDepositIdsPaginated(
        address _user,
        uint256 _startIndex,
        uint256 _limit
    ) external view returns (uint256[] memory depositIds, uint256 total) {
        uint256[] storage userDeposits = userDepositIds[_user];
        total = userDeposits.length;

        if (_startIndex >= total) {
            // Return empty array if start index is out of bounds
            return (new uint256[](0), total);
        }

        // Calculate the actual number of items to return
        uint256 itemsToReturn = _limit;
        if (_startIndex + _limit > total) {
            itemsToReturn = total - _startIndex;
        }

        // Create result array and populate it
        depositIds = new uint256[](itemsToReturn);
        for (uint256 i = 0; i < itemsToReturn; i++) {
            depositIds[i] = userDeposits[_startIndex + i];
        }

        return (depositIds, total);
    }

    /**
     * @notice Gets detailed information about a specific deposit
     * @param _depositId ID of the deposit to query
     * @return DepositInfo struct containing all deposit details
     */

    function getDepositInfo(
        uint256 _depositId
    ) external view returns (DepositInfo memory) {
        return deposits[_depositId];
    }

    /**
     * @notice Checks if a specific deposit is still within its lock period
     * @param _depositId ID of the deposit to check
     * @return True if the deposit is locked, false otherwise
     */
    function isDepositLocked(uint256 _depositId) external view returns (bool) {
        if (lockPeriod == 0) return false;
        DepositInfo storage depositInfo = deposits[_depositId];
        return block.timestamp < depositInfo.depositTime + lockPeriod;
    }

    /**
     * @notice Gets the timestamp when a deposit's lock period expires
     * @param _depositId ID of the deposit to check
     * @return Timestamp when the deposit becomes unlocked (0 if no lock)
     */
    function getDepositUnlockTime(
        uint256 _depositId
    ) external view returns (uint256) {
        if (lockPeriod == 0) return 0;
        DepositInfo storage depositInfo = deposits[_depositId];
        return depositInfo.depositTime + lockPeriod;
    }

    /**
     * @notice Calculates the remaining time until a deposit is unlocked
     * @param _depositId ID of the deposit to check
     * @return Seconds remaining in the lock period (0 if already unlocked)
     */
    function getRemainingLockTime(
        uint256 _depositId
    ) external view returns (uint256) {
        if (lockPeriod == 0) return 0;
        DepositInfo storage depositInfo = deposits[_depositId];
        uint256 unlockTime = depositInfo.depositTime + lockPeriod;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    /**
     * @notice Checks if the staking pool is currently in its active reward period
     * @return True if the current block is within the reward period, false otherwise
     */
    function isPoolActive() external view returns (bool) {
        return block.number >= startBlock && block.number <= bonusEndBlock;
    }
}
