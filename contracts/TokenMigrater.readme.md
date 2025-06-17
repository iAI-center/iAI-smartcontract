# TokenMigrater Contract

A smart contract for migrating source tokens to target tokens at a 1:1 ratio with configurable limits and administrative controls. Originally designed for IAI to VRFI token migration but built generically to support any ERC20 token pair.

## Features

-   **1:1 Migration Ratio**: Exchange source tokens for target tokens at exactly 1:1 ratio
-   **Decimal Verification**: Automatic validation that both tokens have matching decimals
-   **Default Migration Limit**: Single migration limit applied to all wallets
-   **Treasury Management**: Source tokens are sent to a configurable treasury wallet
-   **Pausable**: Admin can pause/unpause migrations
-   **Access Control**: Owner-only administrative functions
-   **Reentrancy Protection**: Safe against reentrancy attacks
-   **Generic Token Support**: Works with any compatible ERC20 token pair

## Contract Functions

### User Functions

#### `migrate(uint256 amount)`

Migrate source tokens to target tokens at 1:1 ratio.

-   Transfers `amount` of source tokens from user to treasury wallet
-   Sends `amount` of target tokens to user
-   Checks migration limits and contract state

#### View Functions

-   `getRemainingMigrationAmount(address user)` - Get remaining migration capacity
-   `canMigrate(address user, uint256 amount)` - Check if migration is possible
-   `getContractInfo()` - Get contract status and balances

### Admin Functions (Owner Only)

#### `pauseMigration(bool paused)`

Pause or unpause the migration functionality.

#### `setTreasuryWallet(address treasuryWallet)`

Update the treasury wallet address that receives source tokens.

#### `setDefaultMigrationLimit(uint256 limit)`

Set the default migration limit for all wallets.

#### `emergencyWithdraw(address token, uint256 amount, address to)`

Emergency function to withdraw any tokens from the contract.

## Deployment

1. **Deploy Prerequisites**: Ensure source and target token contracts are deployed with matching decimals
2. **Deploy TokenMigrater**:
    ```bash
    npx hardhat run scripts/deploy-token-migrater.ts --network <network>
    ```
3. **Fund Contract**: Transfer target tokens to the migrator contract
4. **Configure**: Set migration limits and treasury wallet as needed

## Usage Example

### For Users

```solidity
// 1. Approve source tokens for migration
SourceToken.approve(migraterAddress, migrationAmount);

// 2. Perform migration
TokenMigrater.migrate(migrationAmount);
```

### For Admins

```solidity
// Set default migration limit for all wallets
TokenMigrater.setDefaultMigrationLimit(ethers.parseEther("50000"));

// Pause migration
TokenMigrater.pauseMigration(true);

// Change treasury wallet
TokenMigrater.setTreasuryWallet(newTreasuryAddress);
```

## Security Features

-   **ReentrancyGuard**: Prevents reentrancy attacks
-   **SafeERC20**: Safe token transfers
-   **Access Control**: Ownable pattern for admin functions
-   **Input Validation**: Comprehensive input checks
-   **Custom Errors**: Gas-efficient error handling
-   **Decimal Verification**: Ensures token compatibility at deployment

## Events

-   `Migration(address indexed user, uint256 sourceAmount, uint256 targetAmount)`
-   `MigrationPaused(bool paused)`
-   `TreasuryWalletUpdated(address indexed oldTreasury, address indexed newTreasury)`
-   `DefaultMigrationLimitUpdated(uint256 oldLimit, uint256 newLimit)`
-   `EmergencyWithdraw(address indexed token, uint256 amount, address indexed to)`

## Testing

Run the test suite:

```bash
npx hardhat test test/TokenMigrater.spec.ts
```

## Development

### Approach

The TokenMigrater contract was designed with a focus on security, simplicity, and gas efficiency. The development approach prioritized:

1. **Security First**: Implementation of battle-tested OpenZeppelin contracts and patterns
2. **Simplicity**: Minimal complexity to reduce attack vectors and improve auditability
3. **Flexibility**: Generic token naming to support any ERC20 migration, not just specific tokens
4. **Robustness**: Comprehensive validation and error handling

### Architecture Decisions

#### Token Abstraction

-   **Generic Naming**: Uses `sourceToken` and `targetToken` instead of specific token names
-   **Interface-Based**: Relies on IERC20 and IERC20Metadata interfaces for maximum compatibility
-   **Immutable References**: Token addresses are immutable after deployment for security

#### Migration Logic

-   **1:1 Ratio**: Simple, predictable exchange rate without complex calculations
-   **Default Limits**: Single migration limit applied uniformly to all users
-   **Treasury Pattern**: Source tokens are transferred to a designated treasury wallet

#### Security Patterns

-   **Checks-Effects-Interactions**: Proper ordering of operations in migration function
-   **Reentrancy Guard**: Protection against reentrancy attacks
-   **Access Control**: Owner-only administrative functions
-   **Input Validation**: Comprehensive parameter checking

### Development Progression

#### Phase 1: Initial Implementation

-   Basic migration functionality with 1:1 ratio
-   Per-wallet migration limits with customizable overrides
-   Basic admin controls (pause, treasury management)
-   OpenZeppelin security patterns integration

#### Phase 2: Simplification

-   **Removed Per-Wallet Limits**: Simplified to single default limit for all users
-   **Reduced Complexity**: Eliminated batch operations and custom limit mappings
-   **Cleaner State Management**: Streamlined storage variables and mappings

#### Phase 3: Generic Token Support

-   **Token Renaming**: Changed from `iaiToken`/`vrfiToken` to `sourceToken`/`targetToken`
-   **Decimal Verification**: Added constructor validation to ensure token compatibility
-   **Enhanced Error Handling**: Updated error names and messages for clarity

#### Phase 4: Testing & Documentation

-   **Comprehensive Test Suite**: 12 test cases covering all functionality
-   **Decimal Mismatch Testing**: Specific tests for token compatibility
-   **Documentation Updates**: Complete README and inline documentation
-   **Deployment Scripts**: Production-ready deployment and verification scripts

### Key Technical Decisions

#### Decimal Verification

```solidity
// Verify that both tokens have the same decimals
uint8 sourceDecimals = IERC20Metadata(_sourceToken).decimals();
uint8 targetDecimals = IERC20Metadata(_targetToken).decimals();
if (sourceDecimals != targetDecimals) revert DecimalMismatch();
```

**Rationale**: Prevents deployment with incompatible tokens that would break the 1:1 ratio assumption.

#### Migration Limit Strategy

-   **Single Default Limit**: Simplified from per-wallet customization
-   **Cumulative Tracking**: Tracks total migrated amount per wallet
-   **Administrative Override**: Owner can adjust the default limit for all users

#### Error Handling Evolution

-   **Custom Errors**: Gas-efficient error handling with descriptive names
-   **Specific Error Types**: Different errors for different failure modes
-   **User-Friendly**: Clear error messages for better user experience

### Future Considerations

#### Potential Enhancements

1. **Migration Windows**: Time-based migration periods
2. **Rate Limiting**: Daily/weekly migration limits instead of total limits
3. **Multi-Token Support**: Support for multiple source tokens to single target
4. **Upgrade Patterns**: Proxy pattern for future upgrades

#### Security Improvements

1. **Multi-Signature Treasury**: Enhanced treasury wallet security
2. **Time Delays**: Admin action time delays for increased security
3. **Circuit Breakers**: Additional pause mechanisms for emergency situations

## Gas Optimization

The contract is optimized for gas efficiency:

-   Uses custom errors instead of require strings
-   Immutable variables for token addresses
-   Efficient storage layout
-   Simple migration limit logic
-   Minimal external calls and storage operations

## Verification

After deployment, verify the contract on Etherscan:

```bash
npx hardhat verify --network <network> <contract-address> <constructor-args>
```

## Important Notes

1. **Token Compatibility**: Ensure both source and target tokens have the same decimal places
2. **Target Token Supply**: Ensure the migrator contract has sufficient target tokens before users start migrating
3. **Migration Limits**: Set appropriate limits to prevent abuse and ensure fair distribution
4. **Treasury Security**: Use a secure multisig wallet as the treasury
5. **Testing**: Thoroughly test on testnet before mainnet deployment
6. **Emergency Functions**: Only use emergency withdraw in critical situations
7. **Decimal Verification**: The contract will revert deployment if tokens have mismatched decimals
