// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract IAIPresaleV2 is Ownable, ReentrancyGuard, Pausable {
    IERC20 public usdtToken;
    IERC20 public iaiPresaleToken;

    uint256 public tokenPrice;

    uint256 public startTime;
    uint256 public endTime;

    uint256 public totalTokensSold;
    uint256 public maxSaleAmount;

    uint256 public minPurchaseAmount; // would be 0.1

    // wallet address who will receive the revenue from token selling
    address public revenueReceiver;

    mapping(address => uint256) public userTotalPurchased;

    mapping(address => bool) public whitelisted;

    mapping(address => uint256) public whitelistMaxAmount;

    address[] private whitelistedAddresses;

    bool public isWhitelistEnabled = true; // New state variable

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event PresaleConfigUpdated(
        uint256 newPrice,
        uint256 newStartTime,
        uint256 newEndTime,
        bool newIdWhitelistEnabled
    );

    event PurchaseLimitsUpdated(uint256 minAmount, uint256 maxAmount);
    event MaxSaleAmountUpdated(uint256 amount);
    event USDTWithdrawn(address to, uint256 amount);
    event PresaleTokensWithdrawn(address to, uint256 amount);
    event RevenueReceiverUpdated(address newReceiver);

    event AddressWhitelisted(address indexed account, uint256 maxAmount);
    event AddressRemovedFromWhitelist(address indexed account);
    event BatchWhitelistAdded(address[] accounts, uint256[] maxAmounts);
    event BatchWhitelistRemoved(address[] accounts);
    event MinPurchaseLimitUpdated(uint256 minAmount);
    event BatchWhitelistMaxAmountUpdated(
        address[] accounts,
        uint256[] newMaxAmounts
    );

    event PrematureTokenWithdrawal(address to, uint256 amount);
    event WhitelistEnablingChanged(bool enabled); // New event

    constructor(
        address _usdtToken,
        address _iaiPresaleToken,
        address _revenueReceiver,
        uint256 _tokenPrice,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _maxSaleAmount,
        uint256 _minPurchaseAmount,
        bool _isWhitelistEnabled
    ) Ownable(msg.sender) {
        require(
            _usdtToken != address(0) && _iaiPresaleToken != address(0),
            "Invalid token addresses"
        );
        require(_tokenPrice > 0, "Invalid token price");
        require(_endTime > _startTime, "End time must be after start time");
        require(_maxSaleAmount > 0, "Invalid max sale amount");

        usdtToken = IERC20(_usdtToken);
        iaiPresaleToken = IERC20(_iaiPresaleToken);
        revenueReceiver = _revenueReceiver;

        tokenPrice = _tokenPrice;
        startTime = _startTime;
        endTime = _endTime;
        maxSaleAmount = _maxSaleAmount;

        minPurchaseAmount = _minPurchaseAmount; // for example: 100 * 1e18 => 100 tokens minimum

        isWhitelistEnabled = _isWhitelistEnabled;
    }

    modifier isSaleActive() {
        require(block.timestamp >= startTime, "Presale has not started");
        require(block.timestamp <= endTime, "Presale has ended");
        _;
    }

    function buyTokens(
        uint256 usdtAmount
    ) external nonReentrant isSaleActive whenNotPaused {
        if (isWhitelistEnabled) {
            require(whitelisted[msg.sender], "Address not whitelisted");
        }
        require(revenueReceiver != address(0), "Invalid revenue receiver");
        require(usdtAmount > 0, "Amount must be greater than 0");

        // Calculate token amount based on USDT amount
        uint256 tokenAmount = (usdtAmount * 1e18) / tokenPrice;

        require(
            tokenAmount >= minPurchaseAmount,
            "Below minimum purchase amount"
        );

        uint256 maxAmount = whitelistMaxAmount[msg.sender];
        if (isWhitelistEnabled && maxAmount > 0) {
            // Check limits only if whitelist is enabled and max amount is set
            require(
                userTotalPurchased[msg.sender] + tokenAmount <= maxAmount,
                "Exceeds total allowed purchase amount"
            );
        }

        require(
            totalTokensSold + tokenAmount <= maxSaleAmount,
            "Exceeds max sale amount"
        );

        require(
            usdtToken.balanceOf(msg.sender) >= usdtAmount,
            "Insufficient USDT balance"
        );
        require(
            iaiPresaleToken.balanceOf(address(this)) >= tokenAmount,
            "Insufficient presale token balance"
        );

        require(
            usdtToken.transferFrom(msg.sender, revenueReceiver, usdtAmount),
            "USDT transfer failed"
        );
        require(
            iaiPresaleToken.transfer(msg.sender, tokenAmount),
            "Token transfer failed"
        );

        totalTokensSold += tokenAmount;
        userTotalPurchased[msg.sender] += tokenAmount;
        emit TokensPurchased(msg.sender, tokenAmount, usdtAmount);
    }

    function updatePresaleConfig(
        uint256 newPrice,
        uint256 newStartTime,
        uint256 newEndTime,
        uint256 newMaxSaleAmount,
        bool newIsWhitelistEnabled
    ) external onlyOwner {
        require(newPrice > 0, "Invalid price");
        require(newStartTime < newEndTime, "Invalid time range");
        require(
            newMaxSaleAmount >= totalTokensSold,
            "Max sale amount cannot be less than already sold amount"
        );

        tokenPrice = newPrice;
        startTime = newStartTime;
        endTime = newEndTime;
        maxSaleAmount = newMaxSaleAmount;
        isWhitelistEnabled = newIsWhitelistEnabled;

        emit PresaleConfigUpdated(
            newPrice,
            newStartTime,
            newEndTime,
            newIsWhitelistEnabled
        );
    }

    function setMinPurchaseAmount(uint256 _minAmount) external onlyOwner {
        require(_minAmount > 0, "Invalid minimum");
        minPurchaseAmount = _minAmount;
        emit MinPurchaseLimitUpdated(_minAmount);
    }

    function setMaxSaleAmount(uint256 _maxSaleAmount) external onlyOwner {
        require(
            _maxSaleAmount > totalTokensSold,
            "Max sale amount cannot be less than already sold amount"
        );
        maxSaleAmount = _maxSaleAmount;
        emit MaxSaleAmountUpdated(_maxSaleAmount);
    }

    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    function getPresaleStatus()
        external
        view
        returns (
            bool isActive,
            bool isPaused,
            uint256 remaining,
            uint256 timeUntilStart,
            uint256 timeUntilEnd
        )
    {
        isActive = block.timestamp >= startTime && block.timestamp <= endTime;
        isPaused = paused();
        remaining = maxSaleAmount - totalTokensSold;
        timeUntilStart = startTime > block.timestamp
            ? startTime - block.timestamp
            : 0;
        timeUntilEnd = endTime > block.timestamp
            ? endTime - block.timestamp
            : 0;
    }

    function withdrawUnsoldPresaleTokens() external onlyOwner {
        require(block.timestamp > endTime, "Presale is not ended");
        uint256 balance = iaiPresaleToken.balanceOf(address(this));
        require(balance > 0, "No tokens to withdraw");
        require(
            iaiPresaleToken.transfer(owner(), balance),
            "Token transfer failed"
        );
        emit PresaleTokensWithdrawn(owner(), balance);
    }

    function getAvailableSellAmount() public view returns (uint256) {
        return maxSaleAmount - totalTokensSold;
    }

    function setRevenueReceiver(address _revenueReceiver) external onlyOwner {
        require(_revenueReceiver != address(0), "Invalid address");
        revenueReceiver = _revenueReceiver;
        emit RevenueReceiverUpdated(_revenueReceiver);
    }

    // Add new functions for whitelist management
    function addToWhitelist(
        address account,
        uint256 maxAmount // 0 means no limit
    ) external onlyOwner {
        require(account != address(0), "Invalid address");
        require(!whitelisted[account], "Address already whitelisted");

        whitelisted[account] = true;
        whitelistMaxAmount[account] = maxAmount;
        whitelistedAddresses.push(account);
        emit AddressWhitelisted(account, maxAmount);
    }

    function removeFromWhitelist(address account) external onlyOwner {
        require(whitelisted[account], "Address not whitelisted");
        whitelisted[account] = false;

        // Remove from array by finding and replacing with last element
        for (uint256 i = 0; i < whitelistedAddresses.length; i++) {
            if (whitelistedAddresses[i] == account) {
                whitelistedAddresses[i] = whitelistedAddresses[
                    whitelistedAddresses.length - 1
                ];
                whitelistedAddresses.pop();
                break;
            }
        }

        emit AddressRemovedFromWhitelist(account);
    }

    function batchAddToWhitelist(
        address[] calldata accounts,
        uint256[] calldata maxAmounts // 0 means no limit
    ) external onlyOwner {
        require(accounts.length == maxAmounts.length, "Arrays length mismatch");

        for (uint256 i = 0; i < accounts.length; i++) {
            require(accounts[i] != address(0), "Invalid address");
            whitelisted[accounts[i]] = true;
            whitelistMaxAmount[accounts[i]] = maxAmounts[i];
        }
        emit BatchWhitelistAdded(accounts, maxAmounts);
    }

    function batchRemoveFromWhitelist(
        address[] calldata accounts
    ) external onlyOwner {
        for (uint256 i = 0; i < accounts.length; i++) {
            if (whitelisted[accounts[i]]) {
                whitelisted[accounts[i]] = false;
            }
        }
        emit BatchWhitelistRemoved(accounts);
    }

    function updateWhitelistMaxAmount(
        address account,
        uint256 newMaxAmount // 0 means no limit
    ) external onlyOwner {
        require(whitelisted[account], "Address not whitelisted");
        if (newMaxAmount > 0) {
            require(
                newMaxAmount >= userTotalPurchased[account],
                "New max amount below already purchased amount"
            );
        }

        whitelistMaxAmount[account] = newMaxAmount;
        emit AddressWhitelisted(account, newMaxAmount);
    }

    function batchUpdateWhitelistMaxAmount(
        address[] calldata accounts,
        uint256[] calldata newMaxAmounts
    ) external onlyOwner {
        require(
            accounts.length == newMaxAmounts.length,
            "Arrays length mismatch"
        );

        for (uint256 i = 0; i < accounts.length; i++) {
            require(whitelisted[accounts[i]], "Address not whitelisted");
            if (newMaxAmounts[i] > 0) {
                require(
                    newMaxAmounts[i] >= userTotalPurchased[accounts[i]],
                    "New max amount below already purchased amount"
                );
            }
            whitelistMaxAmount[accounts[i]] = newMaxAmounts[i];
        }
        emit BatchWhitelistMaxAmountUpdated(accounts, newMaxAmounts);
    }

    function isWhitelisted(address account) external view returns (bool) {
        return whitelisted[account];
    }

    // Add new function for pagination
    function getWhitelistedAddresses(
        uint256 offset,
        uint256 limit
    )
        external
        view
        returns (
            address[] memory addresses,
            uint256[] memory maxAmounts,
            uint256 total
        )
    {
        uint256 totalAddresses = whitelistedAddresses.length;

        if (offset >= totalAddresses) {
            return (new address[](0), new uint256[](0), totalAddresses);
        }

        uint256 size = totalAddresses - offset;
        if (size > limit) {
            size = limit;
        }

        addresses = new address[](size);
        maxAmounts = new uint256[](size);

        for (uint256 i = 0; i < size; i++) {
            address account = whitelistedAddresses[offset + i];
            addresses[i] = account;
            maxAmounts[i] = whitelistMaxAmount[account];
        }

        return (addresses, maxAmounts, totalAddresses);
    }

    function getTotalWhitelistedAddresses() external view returns (uint256) {
        return whitelistedAddresses.length;
    }

    // prematureWithdrawPresaleTokens function will be used to withdraw unsold tokens anytime
    // it is different from withdrawUnsoldPresaleTokens which can be called only after presale ends
    function prematureWithdrawPresaleTokens(
        uint256 amount
    ) external onlyOwner whenPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(
            iaiPresaleToken.balanceOf(address(this)) >= amount,
            "Insufficient token balance"
        );

        require(
            iaiPresaleToken.transfer(owner(), amount),
            "Token transfer failed"
        );

        emit PrematureTokenWithdrawal(owner(), amount);
    }

    // Add new function to toggle whitelist
    function setWhitelistStatus(bool _status) external onlyOwner {
        isWhitelistEnabled = _status;
        emit WhitelistEnablingChanged(_status);
    }
}
