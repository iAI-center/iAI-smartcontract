// SPDX-License-Identifier: MIT
pragma solidity 0.8.27;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "bsc-library/contracts/ERC20.sol";
// import "bsc-library/contracts/SafeBEP20.sol";

contract SmartChefInitializableV2 is Ownable, ReentrancyGuard {
    using SafeERC20 for ERC20;

    // The address of the smart chef factory
    address public SMART_CHEF_FACTORY;

    // Whether a limit is set for users
    bool public hasUserLimit;

    // Whether it is initialized
    bool public isInitialized;

    // Accrued token per share
    uint256 public accTokenPerShare;

    // The block number when CAKE mining ends.
    uint256 public bonusEndBlock;

    // The block number when CAKE mining starts.
    uint256 public startBlock;

    // The block number of the last pool update
    uint256 public lastRewardBlock;

    // The pool limit (0 if none)
    uint256 public poolLimitPerUser;

    // CAKE tokens created per block.
    uint256 public rewardPerBlock;

    // The precision factor
    uint256 public PRECISION_FACTOR;

    // The reward token
    ERC20 public rewardToken;

    // The staked token
    ERC20 public stakedToken;

    // Total staked tokens
    uint256 public totalStakedSupply;

    // Lock period in seconds (0 means no lock)
    uint256 public lockPeriod;

    // Info of each user that stakes tokens (stakedToken)
    mapping(address => UserInfo) public userInfo;

    struct UserInfo {
        uint256 amount; // How many staked tokens the user has provided
        uint256 rewardDebt; // Reward debt
        uint256 lastDepositTime; // Timestamp of last deposit
    }

    event AdminTokenRecovery(address tokenRecovered, uint256 amount);
    event Deposit(address indexed user, uint256 amount);
    event EmergencyWithdraw(address indexed user, uint256 amount);
    event NewStartAndEndBlocks(uint256 startBlock, uint256 endBlock);
    event NewRewardPerBlock(uint256 rewardPerBlock);
    event NewPoolLimit(uint256 poolLimitPerUser);
    event RewardsStop(uint256 blockNumber);
    event Withdraw(address indexed user, uint256 amount);

    constructor() Ownable(_msgSender()) {
        SMART_CHEF_FACTORY = msg.sender;
    }

    /*
     * @notice Initialize the contract
     * @param _stakedToken: staked token address
     * @param _rewardToken: reward token address
     * @param _rewardPerBlock: reward per block (in rewardToken)
     * @param _startBlock: start block
     * @param _bonusEndBlock: end block
     * @param _poolLimitPerUser: pool limit per user in stakedToken (if any, else 0)
     * @param _lockPeriod: lock period in seconds (0 means no lock)
     * @param _admin: admin address with ownership
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

        // Calculate and validate total rewards
        uint256 totalBlocks = _bonusEndBlock - _startBlock;
        uint256 totalRewardsNeeded = totalBlocks * _rewardPerBlock;
        require(
            ERC20(_rewardToken).balanceOf(address(this)) >= totalRewardsNeeded,
            "Insufficient reward tokens provided"
        );

        // Make this contract initialized
        isInitialized = true;

        stakedToken = ERC20(_stakedToken);
        rewardToken = ERC20(_rewardToken);
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

    /*
     * @notice Deposit staked tokens and collect reward tokens (if any)
     * @param _amount: amount to deposit (in stakedToken)
     * @note: differ from the original contract, this function checks if the pool is initialized and amount must be greater than 0.
     * then user is not allowed to deposit with 0 amount for harvesting rewards anymore.
     */ function deposit(uint256 _amount) external nonReentrant {
        require(isInitialized, "Pool not initialized");
        require(_amount > 0, "Amount must be greater than 0");
        UserInfo storage user = userInfo[msg.sender];

        if (hasUserLimit) {
            require(
                _amount + user.amount <= poolLimitPerUser,
                "User amount above limit"
            );
        }

        _updatePool();

        if (user.amount > 0) {
            uint256 pending = ((user.amount * accTokenPerShare) /
                PRECISION_FACTOR) - user.rewardDebt;

            // Only give rewards if lock period has passed since last deposit
            bool canReceiveRewards = lockPeriod == 0 ||
                block.timestamp >= user.lastDepositTime + lockPeriod;

            if (pending > 0 && canReceiveRewards) {
                rewardToken.safeTransfer(msg.sender, pending);
            }
        }

        if (_amount > 0) {
            user.amount = user.amount + _amount;
            totalStakedSupply = totalStakedSupply + _amount;
            user.lastDepositTime = block.timestamp; // Update lock timestamp
            stakedToken.safeTransferFrom(msg.sender, address(this), _amount);
        }

        user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;

        emit Deposit(msg.sender, _amount);
    }

    /*
     * @notice Withdraw staked tokens and collect reward tokens
     * @param _amount: amount to withdraw (in stakedToken)
     */
    function withdraw(uint256 _amount) external nonReentrant {
        require(isInitialized, "Pool not initialized");
        UserInfo storage user = userInfo[msg.sender];
        require(user.amount >= _amount, "Amount to withdraw too high");

        _updatePool();

        uint256 pending = ((user.amount * accTokenPerShare) /
            PRECISION_FACTOR) - user.rewardDebt;

        // Only give rewards if lock period has passed
        bool canReceiveRewards = lockPeriod == 0 ||
            block.timestamp >= user.lastDepositTime + lockPeriod;

        if (_amount > 0) {
            user.amount = user.amount - _amount;
            totalStakedSupply = totalStakedSupply - _amount;
            stakedToken.safeTransfer(address(msg.sender), _amount);
        }

        if (pending > 0 && canReceiveRewards) {
            rewardToken.safeTransfer(address(msg.sender), pending);
        }

        user.rewardDebt = (user.amount * accTokenPerShare) / PRECISION_FACTOR;

        emit Withdraw(msg.sender, _amount);
    }

    /*
     * @notice Withdraw staked tokens without caring about rewards rewards
     * @dev Needs to be for emergency.
     */
    function emergencyWithdraw() external nonReentrant {
        UserInfo storage user = userInfo[msg.sender];
        uint256 amountToTransfer = user.amount;

        totalStakedSupply = totalStakedSupply - user.amount;
        user.amount = 0;
        user.rewardDebt = 0;

        if (amountToTransfer > 0) {
            stakedToken.safeTransfer(msg.sender, amountToTransfer);
        }

        emit EmergencyWithdraw(msg.sender, amountToTransfer);
    }

    /*
     * @notice Stop rewards
     * @dev Only callable by owner. Needs to be for emergency.
     */
    function emergencyRewardWithdraw(uint256 _amount) external onlyOwner {
        rewardToken.safeTransfer(msg.sender, _amount);
    }

    /**
     * @notice It allows the admin to recover wrong tokens sent to the contract
     * @param _tokenAddress: the address of the token to withdraw
     * @param _tokenAmount: the number of tokens to withdraw
     * @dev This function is only callable by admin.
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

    /*
     * @notice Stop rewards
     * @dev Only callable by owner
     */
    function stopReward() external onlyOwner {
        bonusEndBlock = block.number;
        emit RewardsStop(block.number);
    }

    /*
     * @notice Update pool limit per user
     * @dev Only callable by owner.
     * @param _hasUserLimit: whether the limit remains forced
     * @param _poolLimitPerUser: new pool limit per user
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

    /*
     * @notice Update reward per block
     * @dev Only callable by owner.
     * @param _rewardPerBlock: the reward per block
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

    /*
     * @notice View function to see pending reward on frontend.
     * @param _user: user address
     * @return Pending reward for a given user
     */
    function pendingReward(address _user) external view returns (uint256) {
        UserInfo storage user = userInfo[_user];
        if (block.number > lastRewardBlock && totalStakedSupply != 0) {
            uint256 multiplier = _getMultiplier(lastRewardBlock, block.number);
            uint256 cakeReward = multiplier * rewardPerBlock;
            uint256 adjustedTokenPerShare = accTokenPerShare +
                ((cakeReward * PRECISION_FACTOR) / totalStakedSupply);
            return
                ((user.amount * adjustedTokenPerShare) / PRECISION_FACTOR) -
                user.rewardDebt;
        } else {
            return
                ((user.amount * accTokenPerShare) / PRECISION_FACTOR) -
                user.rewardDebt;
        }
    }

    /*
     * @notice Update reward variables of the given pool to be up-to-date.
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
        uint256 cakeReward = multiplier * rewardPerBlock;
        accTokenPerShare =
            accTokenPerShare +
            ((cakeReward * PRECISION_FACTOR) / totalStakedSupply);
        lastRewardBlock = block.number;
    }

    /*
     * @notice Return reward multiplier over the given _from to _to block.
     * @param _from: block to start
     * @param _to: block to finish
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

    // Add a view function to get user total staked amount
    function getUserStakedAmount(
        address _user
    ) external view returns (uint256) {
        return userInfo[_user].amount;
    }

    // Add a view function to check if user's tokens are locked
    function isUserLocked(address _user) external view returns (bool) {
        if (lockPeriod == 0) return false;
        UserInfo storage user = userInfo[_user];
        return block.timestamp < user.lastDepositTime + lockPeriod;
    }

    // Add a view function to get user's unlock time
    function getUserUnlockTime(address _user) external view returns (uint256) {
        if (lockPeriod == 0) return 0;
        UserInfo storage user = userInfo[_user];
        return user.lastDepositTime + lockPeriod;
    }

    // Add a view function to get remaining lock time
    function getRemainingLockTime(
        address _user
    ) external view returns (uint256) {
        if (lockPeriod == 0) return 0;
        UserInfo storage user = userInfo[_user];
        uint256 unlockTime = user.lastDepositTime + lockPeriod;
        if (block.timestamp >= unlockTime) return 0;
        return unlockTime - block.timestamp;
    }

    // Add a view function to check if pool is active
    function isPoolActive() external view returns (bool) {
        return block.number >= startBlock && block.number <= bonusEndBlock;
    }
}
