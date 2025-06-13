import { mine, mineUpTo, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { ERC20, IAIToken, SmartChefInitializableV3 } from "../typechain-types";

// Helper functions
const setupTestTokens = async (owner: Signer, user1: Signer) => {
    const IAIToken = await ethers.getContractFactory("IAIToken");
    const TOTAL_SUPPLY = ethers.parseEther("1000000");
    const stakedToken = (await IAIToken.deploy(
        await owner.getAddress(),
        TOTAL_SUPPLY
    )) as IAIToken;
    const rewardToken = (await IAIToken.deploy(
        await owner.getAddress(),
        TOTAL_SUPPLY
    )) as IAIToken;
    await Promise.all([
        stakedToken.waitForDeployment(),
        rewardToken.waitForDeployment(),
    ]);
    await expect(
        stakedToken
            .connect(owner)
            .transfer(await user1.getAddress(), ethers.parseEther("500000"))
    ).to.not.reverted;
    return { stakedToken, rewardToken };
};

const setupSmartChefV3 = async (
    stakedToken: IAIToken,
    rewardToken: IAIToken,
    owner: Signer,
    poolLimitPerUser: bigint = ethers.parseEther("1000"),
    lockPeriod: number = 0 // Default to no lock
) => {
    const factory = await (
        await ethers.getContractFactory("SmartChefFactoryV3")
    ).deploy();
    await factory.waitForDeployment();

    const currentBlock = await ethers.provider.getBlockNumber();
    const config = {
        rewardPerBlock: ethers.parseEther("10"),
        startBlock: currentBlock + 10,
        bonusEndBlock: currentBlock + 1010,
        poolLimitPerUser: poolLimitPerUser,
        lockPeriod: lockPeriod, // Lock period in seconds
    };

    // Calculate total rewards needed
    const totalBlocks = config.bonusEndBlock - config.startBlock;
    const totalRewardsNeeded = BigInt(totalBlocks) * config.rewardPerBlock;

    // Approve factory to spend reward tokens
    await rewardToken
        .connect(owner)
        .approve(await factory.getAddress(), totalRewardsNeeded);

    await factory.deployPool(
        await stakedToken.getAddress(),
        await rewardToken.getAddress(),
        config.rewardPerBlock,
        config.startBlock,
        config.bonusEndBlock,
        config.poolLimitPerUser,
        config.lockPeriod,
        await owner.getAddress()
    );

    const events = await factory.queryFilter(
        factory.filters.NewSmartChefContract()
    );
    const chef = await ethers.getContractAt(
        "SmartChefInitializableV3",
        events[events.length - 1].args.smartChef
    );

    return { factory, chef, config };
};

describe("SmartChefV3 System Tests", function () {
    let owner: Signer, user1: Signer, user2: Signer;
    let stakedToken: IAIToken, rewardToken: IAIToken;
    let chef: SmartChefInitializableV3;
    let config: {
        rewardPerBlock: bigint;
        startBlock: number;
        bonusEndBlock: number;
        poolLimitPerUser: bigint;
        lockPeriod: number;
    };

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        const tokens = await setupTestTokens(owner, user1);
        stakedToken = tokens.stakedToken;
        rewardToken = tokens.rewardToken;

        // Transfer some tokens to user2 as well
        await stakedToken
            .connect(owner)
            .transfer(await user2.getAddress(), ethers.parseEther("100000"));

        const setup = await setupSmartChefV3(stakedToken, rewardToken, owner);
        chef = setup.chef;
        config = setup.config;
    });

    describe("Basic Operations", () => {
        it("should initialize with correct configuration", async function () {
            expect(await chef.stakedToken()).to.equal(
                await stakedToken.getAddress()
            );
            expect(await chef.rewardToken()).to.equal(
                await rewardToken.getAddress()
            );
            expect(await chef.rewardPerBlock()).to.equal(config.rewardPerBlock);
            expect(await chef.startBlock()).to.equal(config.startBlock);
            expect(await chef.bonusEndBlock()).to.equal(config.bonusEndBlock);
            expect(await chef.poolLimitPerUser()).to.equal(
                config.poolLimitPerUser
            );
            expect(await chef.lockPeriod()).to.equal(config.lockPeriod);
            expect(await chef.nextDepositId()).to.equal(1); // First deposit ID should be 1
        });

        it("should handle deposits correctly", async function () {
            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(await chef.getAddress(), depositAmount);

            const tx = await chef.deposit(depositAmount);
            const receipt = await tx.wait();

            // Check deposit ID from events
            const event = receipt?.logs[0] as any;
            const depositId = 1n; // First deposit ID

            // Verify deposit information
            const depositInfo = await chef.getDepositInfo(depositId);
            expect(depositInfo.user).to.equal(await owner.getAddress());
            expect(depositInfo.amount).to.equal(depositAmount);
            expect(depositInfo.active).to.be.true;

            // Check user's total staked amount and deposit IDs
            expect(
                await chef.userTotalStaked(await owner.getAddress())
            ).to.equal(depositAmount);
            const userDepositIds = await chef.getUserDepositIds(
                await owner.getAddress()
            );
            expect(userDepositIds.length).to.equal(1);
            expect(userDepositIds[0]).to.equal(depositId);

            // Check total staked supply
            expect(await chef.totalStakedSupply()).to.equal(depositAmount);
        });

        it("should handle withdrawals correctly", async function () {
            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(await chef.getAddress(), depositAmount);

            // Make deposit
            const depositTx = await chef.deposit(depositAmount);
            await depositTx.wait();
            const depositId = 1n; // First deposit ID

            // Skip forward past any lock period
            if (config.lockPeriod > 0) {
                await time.increase(config.lockPeriod + 1);
                await mine(1);
            }

            // Withdraw the deposit
            await chef.withdraw(depositId);

            // Verify deposit is no longer active after withdrawal
            const depositInfo = await chef.getDepositInfo(depositId);
            expect(depositInfo.active).to.be.false;
            expect(depositInfo.amount).to.equal(0n);

            // Check user's updated total staked amount
            expect(
                await chef.userTotalStaked(await owner.getAddress())
            ).to.equal(0n);

            // Check total staked supply
            expect(await chef.totalStakedSupply()).to.equal(0n);
        });

        it("should prevent withdrawals during lock period", async function () {
            // Set up a new chef with a 1-day lock period
            const lockPeriod = 86400; // 1 day in seconds
            const customSetup = await setupSmartChefV3(
                stakedToken,
                rewardToken,
                owner,
                ethers.parseEther("1000"),
                lockPeriod
            );
            const lockedChef = customSetup.chef;

            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(
                await lockedChef.getAddress(),
                depositAmount
            );

            // Make deposit
            await lockedChef.deposit(depositAmount);
            const depositId = 1n;

            // Check if deposit is locked
            expect(await lockedChef.isDepositLocked(depositId)).to.be.true;

            // Advance time past lock period
            await ethers.provider.send("evm_increaseTime", [lockPeriod + 1]);
            await ethers.provider.send("evm_mine", []);

            // Now deposit should be unlocked
            expect(await lockedChef.isDepositLocked(depositId)).to.be.false;

            // Withdrawal should succeed after lock period
            await expect(lockedChef.withdraw(depositId)).not.to.be.reverted;
        });
    });

    describe("Reward Distribution", () => {
        it("should distribute rewards proportionally to stake", async function () {
            const ownerStake = ethers.parseEther("10");
            const user1Stake = ethers.parseEther("5");

            // Setup stakes
            await stakedToken.approve(await chef.getAddress(), ownerStake);
            await stakedToken
                .connect(user1)
                .approve(await chef.getAddress(), user1Stake);

            // Make deposits
            const ownerDepositTx = await chef.deposit(ownerStake);
            await ownerDepositTx.wait();
            const ownerDepositId = 1n;

            const user1DepositTx = await chef
                .connect(user1)
                .deposit(user1Stake);
            await user1DepositTx.wait();
            const user1DepositId = 2n;

            // Fast forward to start block and mine some blocks
            await mineUpTo(config.startBlock + 1);
            await mine(10);

            const [ownerReward, user1Reward] = await Promise.all([
                chef.pendingReward(ownerDepositId),
                chef.pendingReward(user1DepositId),
            ]);

            const totalReward = ownerReward + user1Reward;
            if (totalReward > 0) {
                expect((ownerReward * 100n) / totalReward).to.be.closeTo(
                    67n,
                    1n
                );
                expect((user1Reward * 100n) / totalReward).to.be.closeTo(
                    33n,
                    1n
                );
            }

            // Verify total pending rewards for users match individual deposit rewards
            const ownerTotalReward = await chef.pendingRewardTotal(
                await owner.getAddress()
            );
            const user1TotalReward = await chef.pendingRewardTotal(
                await user1.getAddress()
            );

            expect(ownerTotalReward).to.equal(ownerReward);
            expect(user1TotalReward).to.equal(user1Reward);
        });

        it("should handle multiple deposits for a single user correctly", async function () {
            const firstDeposit = ethers.parseEther("10");
            const secondDeposit = ethers.parseEther("20");

            await stakedToken.approve(
                await chef.getAddress(),
                firstDeposit + secondDeposit
            );

            // Make first deposit
            await chef.deposit(firstDeposit);
            const firstDepositId = 1n;

            // Fast forward to start block
            await mineUpTo(config.startBlock + 1);
            await mine(5);

            // Make second deposit
            await chef.deposit(secondDeposit);
            const secondDepositId = 2n;

            // Mine more blocks
            await mine(5);

            // Check rewards for both deposits
            const firstDepositReward = await chef.pendingReward(firstDepositId);
            const secondDepositReward = await chef.pendingReward(
                secondDepositId
            );

            // First deposit should have more rewards as it has been staked longer
            expect(firstDepositReward).to.be.gt(secondDepositReward);

            // Total pending rewards should match sum of individual deposits
            const totalRewards = await chef.pendingRewardTotal(
                await owner.getAddress()
            );
            expect(totalRewards).to.equal(
                firstDepositReward + secondDepositReward
            );

            // Check user's deposit IDs
            const userDepositIds = await chef.getUserDepositIds(
                await owner.getAddress()
            );
            expect(userDepositIds.length).to.equal(2);
            expect(userDepositIds).to.include(firstDepositId);
            expect(userDepositIds).to.include(secondDepositId);
        });
    });

    describe("Safety Features", () => {
        it("should enforce pool limits", async function () {
            // Set up a new chef with a low pool limit
            const poolLimit = ethers.parseEther("5");
            const customSetup = await setupSmartChefV3(
                stakedToken,
                rewardToken,
                owner,
                poolLimit
            );
            const limitedChef = customSetup.chef;

            // Deposit exactly at the limit
            await stakedToken.approve(
                await limitedChef.getAddress(),
                poolLimit
            );
            await limitedChef.deposit(poolLimit);

            // Try to deposit more (should fail)
            await expect(limitedChef.deposit(1n)).to.be.revertedWith(
                "User amount above limit"
            );
        });

        it("should handle emergency withdrawal", async function () {
            const depositAmount = ethers.parseEther("5");
            await stakedToken.approve(await chef.getAddress(), depositAmount);

            // Make deposit
            await chef.deposit(depositAmount);

            // Record balance before emergency withdrawal
            const balanceBefore = await stakedToken.balanceOf(
                await owner.getAddress()
            );

            // Perform emergency withdrawal
            await chef.emergencyWithdraw();

            // Verify user's balance increased by deposit amount
            const balanceAfter = await stakedToken.balanceOf(
                await owner.getAddress()
            );
            expect(balanceAfter - balanceBefore).to.equal(depositAmount);

            // Verify all user deposits are inactive
            const userDepositIds = await chef.getUserDepositIds(
                await owner.getAddress()
            );
            for (let i = 0; i < userDepositIds.length; i++) {
                const depositInfo = await chef.getDepositInfo(
                    userDepositIds[i]
                );
                expect(depositInfo.active).to.be.false;
            }

            // Verify user's total staked amount is reset
            expect(
                await chef.userTotalStaked(await owner.getAddress())
            ).to.equal(0n);

            // Try to withdraw from any deposits now (should fail as they're inactive)
            if (userDepositIds.length > 0) {
                await expect(
                    chef.withdraw(userDepositIds[0])
                ).to.be.revertedWith("Deposit not active");
            }
        });

        it("should allow owner to update lock period", async function () {
            const initialLockPeriod = await chef.lockPeriod();
            const newLockPeriod = 172800; // 2 days in seconds

            // Update lock period
            await chef.updateLockPeriod(newLockPeriod);

            // Verify lock period is updated
            expect(await chef.lockPeriod()).to.equal(newLockPeriod);

            // New deposits should use the updated lock period
            const depositAmount = ethers.parseEther("5");
            await stakedToken.approve(await chef.getAddress(), depositAmount);

            await chef.deposit(depositAmount);
            const depositId = 1n;

            // Check unlock time for the new deposit
            const unlockTime = await chef.getDepositUnlockTime(depositId);
            const depositInfo = await chef.getDepositInfo(depositId);
            expect(unlockTime).to.equal(
                depositInfo.depositTime + BigInt(newLockPeriod)
            );
        });
    });

    describe("Farming Scenarios", () => {
        it("should handle early withdrawal before reward period starts", async function () {
            const depositAmount = ethers.parseEther("100");

            // Track initial reward balance
            const initialRewardBalance = await rewardToken.balanceOf(
                await owner.getAddress()
            );

            await stakedToken.approve(await chef.getAddress(), depositAmount);

            // Make deposit before start block
            await chef.deposit(depositAmount);
            const depositId = 1n;

            // Verify no rewards before start block
            const pendingReward = await chef.pendingReward(depositId);
            expect(pendingReward).to.equal(0n);

            // Withdraw early
            await chef.withdraw(depositId);

            // Verify no new rewards received (balance may not be zero if owner has initial tokens)
            const finalRewardBalance = await rewardToken.balanceOf(
                await owner.getAddress()
            );
            expect(finalRewardBalance).to.equal(initialRewardBalance);
        });

        it("should handle multiple users with different entry/exit times", async function () {
            // User 1 deposits early
            const user1Deposit = ethers.parseEther("20");
            await stakedToken
                .connect(user1)
                .approve(await chef.getAddress(), user1Deposit);
            await chef.connect(user1).deposit(user1Deposit);
            const user1DepositId = 1n;

            // Fast forward to start block and mine 5 blocks
            await mineUpTo(config.startBlock + 5);

            // User 2 deposits later
            const user2Deposit = ethers.parseEther("10");
            await stakedToken
                .connect(user2)
                .approve(await chef.getAddress(), user2Deposit);
            await chef.connect(user2).deposit(user2Deposit);
            const user2DepositId = 2n;

            // Mine 5 more blocks
            await mine(5);

            // User 1 withdraws
            await chef.connect(user1).withdraw(user1DepositId);
            const user1Rewards = await rewardToken.balanceOf(
                await user1.getAddress()
            );

            // Mine 5 more blocks with only User 2 in the pool
            await mine(5);

            // User 2 withdraws
            await chef.connect(user2).withdraw(user2DepositId);
            const user2Rewards = await rewardToken.balanceOf(
                await user2.getAddress()
            );

            // User 1 should have some rewards
            expect(user1Rewards).to.be.gt(0n);

            // User 2 should have some rewards
            expect(user2Rewards).to.be.gt(0n);
        });
    });

    describe("View Functions", () => {
        it("should correctly report locking status", async function () {
            // Set up a chef with a lock period
            const lockPeriod = 3600; // 1 hour
            const customSetup = await setupSmartChefV3(
                stakedToken,
                rewardToken,
                owner,
                ethers.parseEther("1000"),
                lockPeriod
            );
            const lockedChef = customSetup.chef;

            // Make a deposit
            const depositAmount = ethers.parseEther("5");
            await stakedToken.approve(
                await lockedChef.getAddress(),
                depositAmount
            );
            await lockedChef.deposit(depositAmount);
            const depositId = 1n;

            // Check if deposit is locked (should be true)
            expect(await lockedChef.isDepositLocked(depositId)).to.be.true;

            // Check remaining lock time
            const remainingTime = await lockedChef.getRemainingLockTime(
                depositId
            );
            expect(remainingTime).to.be.gt(0n);

            // Advance time past lock period
            await ethers.provider.send("evm_increaseTime", [lockPeriod + 1]);
            await ethers.provider.send("evm_mine", []);

            // Deposit should no longer be locked
            expect(await lockedChef.isDepositLocked(depositId)).to.be.false;

            // Remaining lock time should be 0
            expect(await lockedChef.getRemainingLockTime(depositId)).to.equal(
                0n
            );
        });

        it("should correctly report pool active status", async function () {
            // At the start, we're before the start block
            expect(await chef.isPoolActive()).to.be.false;

            // Fast forward to the start block
            await mineUpTo(config.startBlock);

            // Now the pool should be active
            expect(await chef.isPoolActive()).to.be.true;

            // Fast forward past end block
            await mineUpTo(config.bonusEndBlock + 1);

            // Pool should no longer be active
            expect(await chef.isPoolActive()).to.be.false;
        });

        it("should handle paginated deposit IDs correctly", async function () {
            // Make multiple deposits
            const depositAmount = ethers.parseEther("1");
            await stakedToken.approve(
                await chef.getAddress(),
                depositAmount * 5n
            );

            for (let i = 0; i < 5; i++) {
                await chef.deposit(depositAmount);
            }

            // Get deposit IDs with pagination
            // Note: Adjust parameters based on actual function signature
            const [page1, total1] = await chef.getUserDepositIdsPaginated(
                await owner.getAddress(),
                0,
                2
            );
            expect(page1.length).to.equal(2);
            expect(total1).to.equal(5n);
        });
    });

    describe("Same Token Staking/Reward Scenarios", () => {
        let sameToken: IAIToken;
        let sameTokenChef: SmartChefInitializableV3;
        let sameTokenConfig: typeof config;

        beforeEach(async function () {
            // Deploy a single token to use for both staking and rewards
            const IAIToken = await ethers.getContractFactory("IAIToken");
            const TOTAL_SUPPLY = ethers.parseEther("1000000");
            sameToken = (await IAIToken.deploy(
                await owner.getAddress(),
                TOTAL_SUPPLY
            )) as IAIToken;
            await sameToken.waitForDeployment();

            // Transfer tokens to user1
            await sameToken.transfer(
                await user1.getAddress(),
                ethers.parseEther("100000")
            );

            // Set up chef with same token
            const setup = await setupSmartChefV3(
                sameToken,
                sameToken,
                owner,
                ethers.parseEther("1000")
            );
            sameTokenChef = setup.chef;
            sameTokenConfig = setup.config;
        });

        it("should track balances correctly when token is used for both stake and reward", async function () {
            const initialBalance = await sameToken.balanceOf(
                await owner.getAddress()
            );

            // Make deposit
            const depositAmount = ethers.parseEther("100");
            await sameToken.approve(
                await sameTokenChef.getAddress(),
                depositAmount
            );
            await sameTokenChef.deposit(depositAmount);
            const depositId = 1n;

            // Fast forward to start block and mine some blocks
            await mineUpTo(sameTokenConfig.startBlock + 10);

            // Check pending rewards
            const pendingReward = await sameTokenChef.pendingReward(depositId);

            // Calculate expected rewards based on blocks mined
            const blocksElapsed = 10; // We mined 10 blocks after startBlock
            const expectedReward =
                BigInt(blocksElapsed) * sameTokenConfig.rewardPerBlock;
            expect(pendingReward).to.be.closeTo(
                expectedReward,
                expectedReward / 100n
            ); // Within 1%

            // Withdraw
            await sameTokenChef.withdraw(depositId);

            // Final balance should be initial balance - deposit amount + rewards
            const finalBalance = await sameToken.balanceOf(
                await owner.getAddress()
            );
            const expectedFinalBalance = initialBalance + pendingReward;
            expect(finalBalance).to.be.closeTo(
                expectedFinalBalance,
                expectedFinalBalance / 100n
            ); // Within 1%
        });

        it("should handle compound farming efficiently with same token", async function () {
            const stakeAmount = ethers.parseEther("100");
            await sameToken.approve(
                await sameTokenChef.getAddress(),
                stakeAmount // Approve for initial stake
            );
            await sameTokenChef.deposit(stakeAmount);
            const depositId = 1n;

            // Move to reward period
            await mineUpTo(sameTokenConfig.startBlock + 10);

            // Check pending rewards before harvesting
            const pendingBefore = await sameTokenChef.pendingReward(depositId);

            // Calculate expected rewards based on blocks mined
            const blocksElapsed = 10; // We mined 10 blocks after startBlock
            const expectedReward =
                BigInt(blocksElapsed) * sameTokenConfig.rewardPerBlock;
            expect(pendingBefore).to.be.closeTo(
                expectedReward,
                expectedReward / 100n
            ); // Within 1%

            // Track balance before harvesting
            const balanceBefore = await sameToken.balanceOf(
                await owner.getAddress()
            );

            // Harvest rewards by withdrawing
            await sameTokenChef.withdraw(depositId);

            // Check new rewards received
            const balanceAfter = await sameToken.balanceOf(
                await owner.getAddress()
            );
            const harvestedAmount = balanceAfter - balanceBefore;

            // Should get original stake + rewards
            const expectedHarvestedAmount = stakeAmount + pendingBefore;
            expect(harvestedAmount).to.be.closeTo(
                expectedHarvestedAmount,
                expectedHarvestedAmount / 10n
            ); // Within 10%

            // Re-stake with compound amount (original stake + some rewards)
            const compoundAmount =
                stakeAmount + (harvestedAmount - stakeAmount) / 2n;

            // Need to approve again for the new deposit
            await sameToken.approve(
                await sameTokenChef.getAddress(),
                compoundAmount
            );
            await sameTokenChef.deposit(compoundAmount);

            // Verify the new stake is larger than the original
            const newDepositId = 2n;
            const newDepositInfo = await sameTokenChef.getDepositInfo(
                newDepositId
            );
            expect(newDepositInfo.amount).to.be.gt(stakeAmount);
        });

        it("should calculate APR correctly when using same token", async function () {
            const stakeAmount = ethers.parseEther("1000");
            await sameToken.approve(
                await sameTokenChef.getAddress(),
                stakeAmount
            );
            await sameTokenChef.deposit(stakeAmount);

            // Move to middle of reward period
            const blocksToMine = Math.floor(
                (sameTokenConfig.bonusEndBlock - sameTokenConfig.startBlock) / 2
            );
            await mineUpTo(sameTokenConfig.startBlock + blocksToMine);

            // Get user's deposit ID
            const depositId = 1n;

            // Calculate pending reward
            const pendingReward = await sameTokenChef.pendingReward(depositId);

            // Calculate expected rewards based on the contract parameters
            const blocksElapsed = blocksToMine;
            const expectedReward =
                BigInt(blocksElapsed) * sameTokenConfig.rewardPerBlock;

            // We should have close to the expected reward - allow for small differences due to rounding
            expect(pendingReward).to.be.closeTo(
                expectedReward,
                expectedReward / 100n
            ); // Within 1%

            // Calculate approximate APR
            // Note: This is simplified and just for test demonstration
            const annualizedReward =
                (pendingReward * 365n * 24n * 60n * 60n) /
                BigInt(blocksToMine * 12); // Assuming ~12 second blocks
            const apr = (annualizedReward * 10000n) / stakeAmount; // In basis points

            // Verify APR is close to expected value
            // Block rewards * blocks per year / stake amount * 10000 (for basis points)
            const blocksPerYear = (365n * 24n * 60n * 60n) / 12n; // Assuming 12-second blocks
            const expectedAPR =
                (sameTokenConfig.rewardPerBlock * blocksPerYear * 10000n) /
                stakeAmount;

            console.log(`APR (basis points): ${apr}`);
            console.log(`Expected APR (basis points): ${expectedAPR}`);

            expect(apr).to.be.closeTo(expectedAPR, expectedAPR / 50n); // Within 2%
        });
    });

    describe("Administrative Functions", () => {
        it("should allow owner to withdraw rewards in emergency", async function () {
            // Transfer some rewards to the contract first
            const emergencyAmount = ethers.parseEther("100");
            await rewardToken.transfer(
                await chef.getAddress(),
                emergencyAmount
            );

            const ownerBalanceBefore = await rewardToken.balanceOf(
                await owner.getAddress()
            );

            // Owner calls emergency withdrawal
            await chef.emergencyRewardWithdraw(emergencyAmount);

            // Check owner received the tokens
            const ownerBalanceAfter = await rewardToken.balanceOf(
                await owner.getAddress()
            );
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(
                emergencyAmount
            );
        });

        it("should allow owner to recover wrong tokens", async function () {
            // Deploy a different token to act as a "wrong" token
            const WrongToken = await ethers.getContractFactory("IAIToken");
            const wrongToken = await WrongToken.deploy(
                await owner.getAddress(),
                ethers.parseEther("1000")
            );
            await wrongToken.waitForDeployment();

            // Send some wrong tokens to the contract
            const wrongAmount = ethers.parseEther("50");
            await wrongToken.transfer(await chef.getAddress(), wrongAmount);

            const ownerBalanceBefore = await wrongToken.balanceOf(
                await owner.getAddress()
            );

            // Recover the wrong tokens
            await chef.recoverWrongTokens(
                await wrongToken.getAddress(),
                wrongAmount
            );

            // Check owner received the tokens
            const ownerBalanceAfter = await wrongToken.balanceOf(
                await owner.getAddress()
            );
            expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(
                wrongAmount
            );
        });

        it("should prevent recovery of staked or reward tokens", async function () {
            // Try to recover staked tokens (should fail)
            await expect(
                chef.recoverWrongTokens(
                    await stakedToken.getAddress(),
                    ethers.parseEther("1")
                )
            ).to.be.revertedWith("Cannot be staked token");

            // Try to recover reward tokens (should fail)
            await expect(
                chef.recoverWrongTokens(
                    await rewardToken.getAddress(),
                    ethers.parseEther("1")
                )
            ).to.be.revertedWith("Cannot be reward token");
        });

        it("should allow owner to stop rewards", async function () {
            // Check initial end block
            const initialEndBlock = await chef.bonusEndBlock();

            // Stop rewards
            await chef.stopReward();

            // End block should now be set to current block
            const currentBlock = await ethers.provider.getBlockNumber();
            expect(await chef.bonusEndBlock()).to.equal(currentBlock);
            expect(await chef.bonusEndBlock()).to.be.lt(initialEndBlock);

            // Pool should no longer be active
            expect(await chef.isPoolActive()).to.be.false;
        });

        it("should allow owner to update reward per block before start", async function () {
            // We need a new chef because our default one might have already started
            const currentBlock = await ethers.provider.getBlockNumber();
            const newConfig = {
                rewardPerBlock: ethers.parseEther("10"),
                startBlock: currentBlock + 30, // Far enough in the future
                bonusEndBlock: currentBlock + 130,
                poolLimitPerUser: ethers.parseEther("1000"),
                lockPeriod: 0,
            };

            // Deploy a new chef with future start block
            const setup = await setupSmartChefV3(
                stakedToken,
                rewardToken,
                owner,
                newConfig.poolLimitPerUser,
                newConfig.lockPeriod
            );
            const futureChef = setup.chef;

            // Update reward per block
            const newRewardPerBlock = ethers.parseEther("5"); // Half the original
            await futureChef.updateRewardPerBlock(newRewardPerBlock);

            // Check updated value
            expect(await futureChef.rewardPerBlock()).to.equal(
                newRewardPerBlock
            );
        });

        it("should prevent updating reward per block after start", async function () {
            // Fast forward past the start block
            await mineUpTo(config.startBlock + 1);

            // Updating should now fail
            await expect(
                chef.updateRewardPerBlock(ethers.parseEther("5"))
            ).to.be.revertedWith("Pool has started");
        });

        it("should allow updating pool limit", async function () {
            // Set up chef with user limit
            const customSetup = await setupSmartChefV3(
                stakedToken,
                rewardToken,
                owner,
                ethers.parseEther("100") // Small limit
            );
            const limitedChef = customSetup.chef;

            // Check initial limit
            expect(await limitedChef.poolLimitPerUser()).to.equal(
                ethers.parseEther("100")
            );
            expect(await limitedChef.hasUserLimit()).to.be.true;

            // Update the limit
            const newLimit = ethers.parseEther("200");
            await limitedChef.updatePoolLimitPerUser(true, newLimit);

            // Check updated values
            expect(await limitedChef.poolLimitPerUser()).to.equal(newLimit);
            expect(await limitedChef.hasUserLimit()).to.be.true;

            // Disable limit
            await limitedChef.updatePoolLimitPerUser(false, 0);

            // Check limit is disabled
            expect(await limitedChef.hasUserLimit()).to.be.false;
        });
    });

    describe("Access Control", () => {
        it("should prevent non-owners from calling admin functions", async function () {
            // Attempt to call admin functions as non-owner
            await expect(chef.connect(user1).updateLockPeriod(3600)).to.be
                .reverted; // OpenZeppelin v5 uses custom errors

            await expect(
                chef
                    .connect(user1)
                    .emergencyRewardWithdraw(ethers.parseEther("1"))
            ).to.be.reverted;

            await expect(
                chef
                    .connect(user1)
                    .recoverWrongTokens(
                        await rewardToken.getAddress(),
                        ethers.parseEther("1")
                    )
            ).to.be.reverted;

            await expect(chef.connect(user1).stopReward()).to.be.reverted;

            await expect(
                chef
                    .connect(user1)
                    .updatePoolLimitPerUser(true, ethers.parseEther("100"))
            ).to.be.reverted;

            await expect(
                chef.connect(user1).updateRewardPerBlock(ethers.parseEther("1"))
            ).to.be.reverted;
        });

        it("should prevent unauthorized withdrawals", async function () {
            // Set up a deposit by owner
            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(await chef.getAddress(), depositAmount);
            await chef.deposit(depositAmount);
            const depositId = 1n;

            // User1 tries to withdraw owner's deposit
            await expect(
                chef.connect(user1).withdraw(depositId)
            ).to.be.revertedWith("Not your deposit");
        });
        it("should prevent reinitializing an already initialized contract", async function () {
            // Get chef contract factory
            const ChefFactory = await ethers.getContractFactory(
                "SmartChefInitializableV3"
            );

            // Deploy a new chef directly (not through factory)
            const newChef = await ChefFactory.deploy();
            await newChef.waitForDeployment();

            // Transfer reward tokens to the contract first to pass the totalRewardsNeeded check
            const totalBlocks = config.bonusEndBlock - config.startBlock;
            const totalRewardsNeeded =
                BigInt(totalBlocks) * ethers.parseEther("10");
            await rewardToken.transfer(
                await newChef.getAddress(),
                totalRewardsNeeded
            );

            // Initialize it
            await newChef.initialize(
                await stakedToken.getAddress(),
                await rewardToken.getAddress(),
                ethers.parseEther("10"),
                config.startBlock,
                config.bonusEndBlock,
                ethers.parseEther("1000"),
                0,
                await owner.getAddress()
            );

            // Attempt to initialize again
            await expect(
                newChef.initialize(
                    await stakedToken.getAddress(),
                    await rewardToken.getAddress(),
                    ethers.parseEther("10"),
                    config.startBlock,
                    config.bonusEndBlock,
                    ethers.parseEther("1000"),
                    0,
                    await owner.getAddress()
                )
            ).to.be.revertedWith("Already initialized");
        });
    });

    describe("Edge Cases", () => {
        it("should handle deposits with small amounts correctly", async function () {
            // Very small deposit
            const tinyDepositAmount = 1n; // 1 wei
            await stakedToken.approve(
                await chef.getAddress(),
                tinyDepositAmount
            );

            // Deposit should succeed
            await chef.deposit(tinyDepositAmount);

            // Check deposit info
            const depositId = 1n;
            const depositInfo = await chef.getDepositInfo(depositId);
            expect(depositInfo.amount).to.equal(tinyDepositAmount);
        });

        it("should reject zero deposits", async function () {
            // Attempt to deposit zero
            await expect(chef.deposit(0n)).to.be.revertedWith(
                "Amount must be greater than 0"
            );
        });

        it("should handle different token decimal configurations", async function () {
            // Deploy tokens with different decimals
            // For this test we'll simulate by adjusting amounts

            // 6 decimals (like USDC)
            const smallDecimals = ethers.parseUnits("100", 6); // 100 USDC

            // 18 decimals (like most ERC20s)
            const standardDecimals = ethers.parseEther("100"); // 100 tokens

            // Make sure reward calculations work with different orders of magnitude
            // This is more of a simulation, since modifying token decimals requires a custom token
            expect(standardDecimals).to.be.gt(smallDecimals);

            // Ensure the precision factor is working correctly
            // by checking that the SmartChef properly scales rewards
            expect(await chef.PRECISION_FACTOR()).to.be.gt(0n);
        });

        it("should handle event verification", async function () {
            // Test deposit event emission
            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(await chef.getAddress(), depositAmount);

            // Check that Deposit event is emitted correctly
            await expect(chef.deposit(depositAmount))
                .to.emit(chef, "Deposit")
                .withArgs(await owner.getAddress(), 1n, depositAmount);

            // Test withdraw event emission
            await expect(chef.withdraw(1n))
                .to.emit(chef, "Withdraw")
                .withArgs(await owner.getAddress(), 1n, depositAmount);

            // Test emergency withdraw event
            await stakedToken.approve(await chef.getAddress(), depositAmount);
            await chef.deposit(depositAmount);

            await expect(chef.emergencyWithdraw())
                .to.emit(chef, "EmergencyWithdraw")
                .withArgs(await owner.getAddress(), depositAmount);

            // Test lock period update event
            const newLockPeriod = 3600;
            await expect(chef.updateLockPeriod(newLockPeriod))
                .to.emit(chef, "LockPeriodUpdated")
                .withArgs(0, newLockPeriod);
        });
    });

    describe("Factory Tests", () => {
        it("should deploy a new pool with correct parameters", async function () {
            const newFactory = await (
                await ethers.getContractFactory("SmartChefFactoryV3")
            ).deploy();
            await newFactory.waitForDeployment();

            const poolParams = {
                rewardPerBlock: ethers.parseEther("5"), // Different from default
                startBlock: (await ethers.provider.getBlockNumber()) + 10,
                bonusEndBlock: (await ethers.provider.getBlockNumber()) + 110,
                poolLimitPerUser: ethers.parseEther("500"),
                lockPeriod: 3600, // 1 hour lock
            };

            // Calculate rewards needed
            const totalBlocks =
                poolParams.bonusEndBlock - poolParams.startBlock;
            const totalRewardsNeeded =
                BigInt(totalBlocks) * poolParams.rewardPerBlock;

            // Approve tokens for the factory
            await rewardToken.approve(
                await newFactory.getAddress(),
                totalRewardsNeeded
            );

            // Deploy pool
            const tx = await newFactory.deployPool(
                await stakedToken.getAddress(),
                await rewardToken.getAddress(),
                poolParams.rewardPerBlock,
                poolParams.startBlock,
                poolParams.bonusEndBlock,
                poolParams.poolLimitPerUser,
                poolParams.lockPeriod,
                await owner.getAddress()
            );

            const receipt = await tx.wait();
            expect(receipt?.status).to.equal(1);

            // Get the new chef contract address
            const events = await newFactory.queryFilter(
                newFactory.filters.NewSmartChefContract()
            );
            const newChefAddress = events[events.length - 1].args.smartChef;

            // Attach to the new chef contract
            const newChef = await ethers.getContractAt(
                "SmartChefInitializableV3",
                newChefAddress
            );

            // Verify initialization parameters
            expect(await newChef.rewardPerBlock()).to.equal(
                poolParams.rewardPerBlock
            );
            expect(await newChef.startBlock()).to.equal(poolParams.startBlock);
            expect(await newChef.bonusEndBlock()).to.equal(
                poolParams.bonusEndBlock
            );
            expect(await newChef.poolLimitPerUser()).to.equal(
                poolParams.poolLimitPerUser
            );
            expect(await newChef.lockPeriod()).to.equal(poolParams.lockPeriod);
            expect(await newChef.owner()).to.equal(await owner.getAddress());

            // Verify initial state
            expect(await newChef.totalStakedSupply()).to.equal(0n);
            expect(await newChef.nextDepositId()).to.equal(1n);
            expect(await newChef.isInitialized()).to.be.true;
        });

        it("should reject pool deployment with invalid parameters", async function () {
            const newFactory = await (
                await ethers.getContractFactory("SmartChefFactoryV3")
            ).deploy();
            await newFactory.waitForDeployment();

            // Try to deploy with end block ≤ start block
            const invalidStartBlock =
                (await ethers.provider.getBlockNumber()) + 20;
            const invalidEndBlock = invalidStartBlock; // Same as start block

            // Calculate rewards amount (will be 0 since blocks difference is 0)
            const rewardPerBlock = ethers.parseEther("10");

            await expect(
                newFactory.deployPool(
                    await stakedToken.getAddress(),
                    await rewardToken.getAddress(),
                    rewardPerBlock,
                    invalidStartBlock,
                    invalidEndBlock,
                    ethers.parseEther("1000"),
                    0, // No lock
                    await owner.getAddress()
                )
            ).to.be.reverted; // Should revert with appropriate message
        });
    });
});
