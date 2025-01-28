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

    uint256 public minPurchaseAmount; // 0.1
    uint256 public maxPurchaseAmount;

    // wallet address who will receive the revenue from token selling
    address public revenueReceiver;

    mapping(address => uint256) public userTotalPurchased;

    event TokensPurchased(address indexed buyer, uint256 amount, uint256 cost);
    event PresaleConfigUpdated(
        uint256 newPrice,
        uint256 newStartTime,
        uint256 newEndTime
    );
    event PurchaseLimitsUpdated(uint256 minAmount, uint256 maxAmount);
    event MaxSaleAmountUpdated(uint256 amount);
    event USDTWithdrawn(address to, uint256 amount);
    event PresaleTokensWithdrawn(address to, uint256 amount);
    event RevenueReceiverUpdated(address newReceiver);

    constructor(
        address _usdtToken,
        address _iaiPresaleToken,
        address _revenueReceiver,
        uint256 _tokenPrice,
        uint256 _startTime,
        uint256 _endTime,
        uint256 _maxSaleAmount,
        uint256 _minPurchaseAmount,
        uint256 _maxPurchaseAmount
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
        maxPurchaseAmount = _maxPurchaseAmount; // for example: 10000 * 1e18 => 10000 tokens maximum
    }

    modifier isSaleActive() {
        require(block.timestamp >= startTime, "Presale has not started");
        require(block.timestamp <= endTime, "Presale has ended");
        _;
    }

    function buyTokens(
        uint256 usdtAmount
    ) external nonReentrant isSaleActive whenNotPaused {
        require(revenueReceiver != address(0), "Invalid revenue receiver");
        require(usdtAmount > 0, "Amount must be greater than 0");

        // Calculate token amount based on USDT amount
        uint256 tokenAmount = (usdtAmount * 1e18) / tokenPrice;

        require(
            tokenAmount >= minPurchaseAmount,
            "Below minimum purchase amount"
        );
        require(
            tokenAmount <= maxPurchaseAmount,
            "Exceeds maximum purchase amount"
        );
        require(
            userTotalPurchased[msg.sender] + tokenAmount <= maxPurchaseAmount,
            "Exceeds user maximum"
        );

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
        uint256 newMaxSaleAmount
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

        emit PresaleConfigUpdated(newPrice, newStartTime, newEndTime);
    }

    function setPurchaseLimits(
        uint256 _minAmount,
        uint256 _maxAmount
    ) external onlyOwner {
        require(_minAmount > 0 && _maxAmount > _minAmount, "Invalid limits");
        minPurchaseAmount = _minAmount;
        maxPurchaseAmount = _maxAmount;
        emit PurchaseLimitsUpdated(_minAmount, _maxAmount);
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

    function setMaxSaleAmount(uint256 _maxSaleAmount) external onlyOwner {
        require(
            _maxSaleAmount > totalTokensSold,
            "Max sale amount cannot be less than already sold amount"
        );
        maxSaleAmount = _maxSaleAmount;
        emit MaxSaleAmountUpdated(_maxSaleAmount);
    }

    function getAvailableSellAmount() public view returns (uint256) {
        return maxSaleAmount - totalTokensSold;
    }

    function setRevenueReceiver(address _revenueReceiver) external onlyOwner {
        require(_revenueReceiver != address(0), "Invalid address");
        revenueReceiver = _revenueReceiver;
        emit RevenueReceiverUpdated(_revenueReceiver);
    }
}
