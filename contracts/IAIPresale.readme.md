# IAI Token Presale Contract

A smart contract that manages the presale of IAI tokens with whitelist support, maximum sale limit, purchase limits, and USDT payment.

## Contract Overview

[`IAIPresale.sol`](contracts/IAIPresale.sol) implements a token presale mechanism with the following features:

-   USDT payment for [Presale] IAI tokens
-   Whitelist functionality; Add/Remove whitelisting addresses and enable/disable whitelist-only mode (for public sale round)
-   Adjustable per user purchase limits
-   Adjustable Maximum Sale Amount
-   Pausable functionality
-   Time-bounded presale period
-   Owner-controlled configuration

## Contract Roles

-   **Owner**: Has access to admin functions marked with `onlyOwner` modifier
-   **Buyers**: Users who can purchase tokens if they meet requirements
-   **Whitelisted Users**: Addresses approved to participate in whitelist-only sales

## Key Functions

### For Buyers

```solidity
function buyTokens(uint256 tokenAmount) external
```

Allows users to purchase IAI tokens by paying with USDT:

-   Must be within presale period
-   Must not be paused
-   Must meet minimum/maximum purchase limits
-   Must be whitelisted if whitelist-only mode is active
-   Requires sufficient USDT balance and allowance

### For Admin/Owner

```solidity
function updateWhitelist(address[] calldata users, bool status) external
```

Adds or removes addresses from the whitelist.

```solidity
function updatePresaleConfig(
    uint256 newPrice,
    uint256 newStartTime,
    uint256 newEndTime,
    uint256 newMaxSaleAmount,
    bool newWhitelistOnly
) external
```

Updates presale parameters:

-   Token price
-   Start/end times
-   Maximum sale amount
-   Whitelist requirement

```solidity
function setPurchaseLimits(uint256 _minAmount, uint256 _maxAmount) external
```

Sets minimum and maximum purchase amounts per user.

```solidity
function withdrawUSDT(address to) external
```

Withdraws collected USDT to specified address.

```solidity
function withdrawUnsoldPresaleTokens() external
```

Withdraws unsold IAI tokens after presale ends.

````solidity

### View Functions

```solidity
function getPresaleStatus() external view returns (
    bool isActive,
    bool isPaused,
    uint256 remaining,
    uint256 timeUntilStart,
    uint256 timeUntilEnd
)
````

Returns current presale status information.

-   isActive: Whether presale is active (still in start-end period)
-   isPaused: Whether presale is paused by admin
-   remaining: Remaining tokens available for sale
-   timeUntilStart: Time until presale starts. for example, presale starts in {timeUntilStart} seconds
-   timeUntilEnd: Time until presale ends. for example, presale ends in {timeUntilEnd} seconds

```solidity
function getAvailableSellAmount() public view returns (uint256)
```

Returns remaining tokens available for sale.

it returns the same amount as `remaining` in `getPresaleStatus` function.

```solidity

## State Variables

### Token Contracts

-   `usdtToken`: The USDT token contract used for payments
-   `iaiPresaleToken`: The IAI token contract being sold

### Configuration

-   `tokenPrice`: Price per token in USDT (18 decimals)
-   `startTime`: Presale start timestamp
-   `endTime`: Presale end timestamp
-   `isWhitelistOnly`: Whether only whitelisted addresses can participate
-   `maxSaleAmount`: Maximum tokens available for sale
-   `minPurchaseAmount`: Minimum purchase amount per transaction
-   `maxPurchaseAmount`: Maximum purchase amount per user

### Tracking

-   `totalTokensSold`: Total number of tokens sold
-   `whitelist`: Mapping of whitelisted addresses
-   `userTotalPurchased`: Mapping of total tokens purchased per user

## Security Features

-   ReentrancyGuard protection
-   Pausable functionality
-   Owner access control
-   Input validation
-   Safe token transfer checks
```

## Deployment

### 2025-01-10

#### IAI Presale Contract

Amoy testnet: https://amoy.polygonscan.com/address/0x71b731a8198BAeEF01f8596770970f8Aecb3eC7D#readContract
Bsc testnet: 0xef7cD0186b41d9736589A5336c37CF3B30198Dd8
