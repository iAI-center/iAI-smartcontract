import { ethers } from "hardhat";
import { expect } from "chai";
import { Signer } from "ethers";
import { IAIToken } from "../typechain-types/contracts/IAI.sol";
import {
    SmartChefInitializableV4,
    SmartChefFactoryV4,
} from "../typechain-types";

// Helper functions
const setupTestTokens = async (owner: Signer, user1: Signer, user2: Signer) => {
    const IAIToken = await ethers.getContractFactory("IAIToken");
    const TOTAL_SUPPLY = ethers.parseEther("1000000");

    // Create a single token that will be used for both staking and rewards
    const token = (await IAIToken.deploy(
        await owner.getAddress(),
        TOTAL_SUPPLY
    )) as IAIToken;

    await token.waitForDeployment();

    // Transfer tokens to users for testing
    await expect(
        token
            .connect(owner)
            .transfer(await user1.getAddress(), ethers.parseEther("100000"))
    ).to.not.reverted;

    await expect(
        token
            .connect(owner)
            .transfer(await user2.getAddress(), ethers.parseEther("100000"))
    ).to.not.reverted;

    return { token };
};

const setupSmartChefV4 = async (
    token: IAIToken,
    owner: Signer,
    poolLimitPerUser: bigint = ethers.parseEther("1000"),
    lockPeriod: number = 200 // 200 blocks = ~10 minutes on BSC
) => {
    const factory = await (
        await ethers.getContractFactory("SmartChefFactoryV4")
    ).deploy();
    await factory.waitForDeployment();

    const currentBlock = await ethers.provider.getBlockNumber();
    const config = {
        rewardPerBlock: ethers.parseEther("1"), // 1 token per block
        startBlock: currentBlock + 10,
        bonusEndBlock: currentBlock + 1010, // 1000 blocks duration
        poolLimitPerUser: poolLimitPerUser,
        lockPeriod: lockPeriod,
    };

    // Calculate total rewards needed
    const totalBlocks = config.bonusEndBlock - config.startBlock;
    const totalRewardsNeeded = BigInt(totalBlocks) * config.rewardPerBlock;

    // Approve factory to spend reward tokens
    await token
        .connect(owner)
        .approve(await factory.getAddress(), totalRewardsNeeded);

    await factory.deployPool(
        await token.getAddress(), // Same token for staking
        await token.getAddress(), // Same token for rewards
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
        "SmartChefInitializableV4",
        events[events.length - 1].args.smartChef
    );

    return { factory, chef, config };
};

// Helper function to mine blocks
const mineBlocks = async (blocks: number) => {
    for (let i = 0; i < blocks; i++) {
        await ethers.provider.send("evm_mine", []);
    }
};

// Helper function to skip to a specific block
const skipToBlock = async (targetBlock: number) => {
    const currentBlock = await ethers.provider.getBlockNumber();
    if (targetBlock > currentBlock) {
        await mineBlocks(targetBlock - currentBlock);
    }
};

describe("SmartChefV4 System Tests - Same Token Staking/Rewards", function () {
    let owner: Signer, user1: Signer, user2: Signer;
    let token: IAIToken;
    let chef: SmartChefInitializableV4;
    let config: {
        rewardPerBlock: bigint;
        startBlock: number;
        bonusEndBlock: number;
        poolLimitPerUser: bigint;
        lockPeriod: number;
    };

    beforeEach(async function () {
        [owner, user1, user2] = await ethers.getSigners();
        const tokens = await setupTestTokens(owner, user1, user2);
        token = tokens.token;

        const setup = await setupSmartChefV4(token, owner);
        chef = setup.chef;
        config = setup.config;
    });

    describe("Basic Initialization", () => {
        it("should initialize with correct configuration", async function () {
            expect(await chef.stakedToken()).to.equal(await token.getAddress());
            expect(await chef.rewardToken()).to.equal(await token.getAddress());
            expect(await chef.rewardPerBlock()).to.equal(config.rewardPerBlock);
            expect(await chef.startBlock()).to.equal(config.startBlock);
            expect(await chef.bonusEndBlock()).to.equal(config.bonusEndBlock);
            expect(await chef.poolLimitPerUser()).to.equal(
                config.poolLimitPerUser
            );
            expect(await chef.lockingPeriod()).to.equal(config.lockPeriod);
            expect(await chef.hasUserLimit()).to.be.true;
            expect(await chef.isInitialized()).to.be.true;
        });

        it("should track token balances correctly with same token", async function () {
            const initialOwnerBalance = await token.balanceOf(
                await owner.getAddress()
            );
            const initialContractBalance = await token.balanceOf(
                await chef.getAddress()
            );

            // Contract should have the total rewards allocated
            const totalBlocks = config.bonusEndBlock - config.startBlock;
            const expectedRewards = BigInt(totalBlocks) * config.rewardPerBlock;
            expect(initialContractBalance).to.equal(expectedRewards);
        });
    });

    describe("Locking Period Mechanics", () => {
        it("should set lock period correctly on first deposit", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            const userInfo = await chef.userInfo(await user1.getAddress());
            const currentBlock = await ethers.provider.getBlockNumber();

            expect(userInfo.amount).to.equal(depositAmount);
            expect(userInfo.lockEndBlock).to.equal(
                currentBlock + config.lockPeriod
            );
            expect(userInfo.heldRewards).to.equal(0);
            expect(await chef.isInLockPeriod(await user1.getAddress())).to.be
                .true;
        });

        it("should reset lock period on additional deposits", async function () {
            const firstDeposit = ethers.parseEther("50");
            const secondDeposit = ethers.parseEther("30");

            // First deposit
            await token
                .connect(user1)
                .approve(await chef.getAddress(), firstDeposit + secondDeposit);
            await chef.connect(user1).deposit(firstDeposit);

            const firstLockEnd = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;

            // Mine some blocks and make second deposit
            await mineBlocks(50);
            await chef.connect(user1).deposit(secondDeposit);

            const userInfo = await chef.userInfo(await user1.getAddress());
            const currentBlock = await ethers.provider.getBlockNumber();

            expect(userInfo.amount).to.equal(firstDeposit + secondDeposit);
            expect(userInfo.lockEndBlock).to.equal(
                currentBlock + config.lockPeriod
            );
            expect(userInfo.lockEndBlock).to.be.greaterThan(firstLockEnd);
        });

        it("should prevent withdrawal during lock period", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Try to withdraw during lock period
            await expect(
                chef.connect(user1).withdraw(depositAmount)
            ).to.be.revertedWith("Cannot withdraw during lock period");
        });

        it("should allow withdrawal after lock period expires", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to after farming starts and mine blocks during lock period
            await skipToBlock(config.startBlock + 50);

            // Skip to after lock period
            const userInfo = await chef.userInfo(await user1.getAddress());
            await skipToBlock(Number(userInfo.lockEndBlock) + 1);

            const balanceBefore = await token.balanceOf(
                await user1.getAddress()
            );
            await chef.connect(user1).withdraw(depositAmount);
            const balanceAfter = await token.balanceOf(
                await user1.getAddress()
            );

            // Should receive both staked amount and rewards
            expect(balanceAfter).to.be.greaterThan(
                balanceBefore + depositAmount
            );
        });
    });

    describe("Reward Accumulation During Lock", () => {
        it("should accumulate rewards in heldRewards during lock period", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to farming start
            await skipToBlock(config.startBlock + 1);

            // Mine blocks during lock period
            await mineBlocks(50);

            // Make another deposit to trigger reward calculation
            await chef.connect(user1).deposit(0);

            const userInfo = await chef.userInfo(await user1.getAddress());
            expect(userInfo.heldRewards).to.be.greaterThan(0);
            expect(await chef.isInLockPeriod(await user1.getAddress())).to.be
                .true;
        });

        it("should hold rewards and reset lock period on additional deposit during lock", async function () {
            const firstDeposit = ethers.parseEther("100");
            const secondDeposit = ethers.parseEther("50");

            await token
                .connect(user1)
                .approve(await chef.getAddress(), firstDeposit + secondDeposit);

            // First deposit
            await chef.connect(user1).deposit(firstDeposit);

            // Skip to farming start and mine some blocks
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(50);

            // Second deposit during lock period
            await chef.connect(user1).deposit(secondDeposit);

            const userInfo = await chef.userInfo(await user1.getAddress());
            const currentBlock = await ethers.provider.getBlockNumber();

            expect(userInfo.amount).to.equal(firstDeposit + secondDeposit);
            expect(userInfo.heldRewards).to.be.greaterThan(0);
            expect(userInfo.lockEndBlock).to.equal(
                currentBlock + config.lockPeriod
            );
        });

        it("should pay out held rewards and pending rewards after lock expires", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to farming start and accumulate rewards during lock
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(50);

            // Trigger held rewards by making a zero deposit
            await chef.connect(user1).deposit(0);
            const heldRewardsAmount = (
                await chef.userInfo(await user1.getAddress())
            ).heldRewards;

            // Skip to after lock period and accumulate more rewards
            const lockEndBlock = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            await skipToBlock(Number(lockEndBlock) + 50);

            const balanceBefore = await token.balanceOf(
                await user1.getAddress()
            );

            // Claim all rewards
            await chef.connect(user1).claimRewards();

            const balanceAfter = await token.balanceOf(
                await user1.getAddress()
            );
            const rewardsReceived = balanceAfter - balanceBefore;

            // Should receive both held rewards and pending rewards
            expect(rewardsReceived).to.be.greaterThan(heldRewardsAmount);

            const userInfoAfter = await chef.userInfo(await user1.getAddress());
            expect(userInfoAfter.heldRewards).to.equal(0);
        });
    });

    describe("Same Token Balance Tracking", () => {
        it("should track staked vs reward balances correctly", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            const contractBalanceBefore = await token.balanceOf(
                await chef.getAddress()
            );
            const totalStakedBefore = await chef.totalStakedSupply();

            await chef.connect(user1).deposit(depositAmount);

            const contractBalanceAfter = await token.balanceOf(
                await chef.getAddress()
            );
            const totalStakedAfter = await chef.totalStakedSupply();

            expect(contractBalanceAfter).to.equal(
                contractBalanceBefore + depositAmount
            );
            expect(totalStakedAfter).to.equal(
                totalStakedBefore + depositAmount
            );
        });

        it("should handle reward distribution without affecting staked balance tracking", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to after lock period
            await skipToBlock(config.startBlock + 1);
            const lockEndBlock = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            await skipToBlock(Number(lockEndBlock) + 50);

            const totalStakedBefore = await chef.totalStakedSupply();
            const contractBalanceBefore = await token.balanceOf(
                await chef.getAddress()
            );

            // Claim rewards without withdrawing stake
            await chef.connect(user1).claimRewards();

            const totalStakedAfter = await chef.totalStakedSupply();
            const contractBalanceAfter = await token.balanceOf(
                await chef.getAddress()
            );

            // Staked supply should remain the same
            expect(totalStakedAfter).to.equal(totalStakedBefore);
            // Contract balance should decrease by reward amount
            expect(contractBalanceAfter).to.be.lessThan(contractBalanceBefore);
        });
    });

    describe("Multiple Users Scenarios", () => {
        it("should handle multiple users with different lock periods correctly", async function () {
            const depositAmount = ethers.parseEther("100");

            // User1 deposits first
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);
            await chef.connect(user1).deposit(depositAmount);
            const user1LockEnd = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;

            // Mine some blocks
            await mineBlocks(50);

            // User2 deposits later
            await token
                .connect(user2)
                .approve(await chef.getAddress(), depositAmount);
            await chef.connect(user2).deposit(depositAmount);
            const user2LockEnd = (await chef.userInfo(await user2.getAddress()))
                .lockEndBlock;

            expect(user2LockEnd).to.be.greaterThan(user1LockEnd);

            // Skip to farming start
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(50);

            // User1's lock should expire first
            await skipToBlock(Number(user1LockEnd) + 1);

            expect(await chef.isInLockPeriod(await user1.getAddress())).to.be
                .false;
            expect(await chef.isInLockPeriod(await user2.getAddress())).to.be
                .true;

            // User1 should be able to withdraw
            await expect(chef.connect(user1).withdraw(depositAmount)).to.not.be
                .reverted;

            // User2 should still be locked
            await expect(
                chef.connect(user2).withdraw(depositAmount)
            ).to.be.revertedWith("Cannot withdraw during lock period");
        });

        it("should distribute rewards proportionally among multiple users", async function () {
            const user1Deposit = ethers.parseEther("100");
            const user2Deposit = ethers.parseEther("200");

            // Both users deposit at the same time
            await token
                .connect(user1)
                .approve(await chef.getAddress(), user1Deposit);
            await token
                .connect(user2)
                .approve(await chef.getAddress(), user2Deposit);

            await chef.connect(user1).deposit(user1Deposit);
            await chef.connect(user2).deposit(user2Deposit);

            // Skip to farming start and accumulate rewards
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(100);

            // Skip to after lock periods
            const user1LockEnd = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            const user2LockEnd = (await chef.userInfo(await user2.getAddress()))
                .lockEndBlock;
            const maxLockEnd = Math.max(
                Number(user1LockEnd),
                Number(user2LockEnd)
            );
            await skipToBlock(maxLockEnd + 1);

            const user1BalanceBefore = await token.balanceOf(
                await user1.getAddress()
            );
            const user2BalanceBefore = await token.balanceOf(
                await user2.getAddress()
            );

            // Both users withdraw everything
            await chef.connect(user1).withdraw(user1Deposit);
            await chef.connect(user2).withdraw(user2Deposit);

            const user1BalanceAfter = await token.balanceOf(
                await user1.getAddress()
            );
            const user2BalanceAfter = await token.balanceOf(
                await user2.getAddress()
            );

            const user1Rewards =
                user1BalanceAfter - user1BalanceBefore - user1Deposit;
            const user2Rewards =
                user2BalanceAfter - user2BalanceBefore - user2Deposit;

            // User2 should receive approximately twice the rewards of User1 (since they staked twice as much)
            const ratio = Number(user2Rewards) / Number(user1Rewards);
            expect(ratio).to.be.closeTo(2, 0.1);
        });
    });

    describe("Administrative Functions", () => {
        it("should allow owner to update locking period before start", async function () {
            const newLockPeriod = 300; // 300 blocks

            await chef.updateLockingPeriod(newLockPeriod);

            expect(await chef.lockingPeriod()).to.equal(newLockPeriod);
        });

        it("should prevent updating locking period after start", async function () {
            // Skip to after start
            await skipToBlock(config.startBlock + 1);

            await expect(chef.updateLockingPeriod(300)).to.be.revertedWith(
                "Pool has started"
            );
        });

        it("should allow emergency reward withdrawal by owner", async function () {
            const withdrawAmount = ethers.parseEther("100");
            const ownerBalanceBefore = await token.balanceOf(
                await owner.getAddress()
            );

            await chef.emergencyRewardWithdraw(withdrawAmount);

            const ownerBalanceAfter = await token.balanceOf(
                await owner.getAddress()
            );
            expect(ownerBalanceAfter).to.equal(
                ownerBalanceBefore + withdrawAmount
            );
        });

        it("should prevent token recovery of staked/reward token", async function () {
            await expect(
                chef.recoverWrongTokens(
                    await token.getAddress(),
                    ethers.parseEther("1")
                )
            ).to.be.revertedWith("Cannot be staked token");
        });
    });

    describe("Emergency Functions", () => {
        it("should allow emergency withdraw regardless of lock period", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Emergency withdraw during lock period should work
            const balanceBefore = await token.balanceOf(
                await user1.getAddress()
            );
            await chef.connect(user1).emergencyWithdraw();
            const balanceAfter = await token.balanceOf(
                await user1.getAddress()
            );

            expect(balanceAfter).to.equal(balanceBefore + depositAmount);

            // User info should be reset
            const userInfo = await chef.userInfo(await user1.getAddress());
            expect(userInfo.amount).to.equal(0);
            expect(userInfo.heldRewards).to.equal(0);
            expect(userInfo.lockEndBlock).to.equal(0);
        });
    });

    describe("View Functions", () => {
        it("should correctly report pending rewards", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to farming start
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(50);

            const pendingRewards = await chef.pendingReward(
                await user1.getAddress()
            );
            expect(pendingRewards).to.be.greaterThan(0);
        });

        it("should correctly report total claimable rewards", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Accumulate some held rewards during lock
            await skipToBlock(config.startBlock + 1);
            await mineBlocks(50);
            await chef.connect(user1).deposit(0); // Trigger held rewards

            // Skip to after lock and accumulate more rewards
            const lockEndBlock = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            await skipToBlock(Number(lockEndBlock) + 50);

            const totalClaimable = await chef.totalClaimableRewards(
                await user1.getAddress()
            );
            const heldRewards = await chef.heldRewards(
                await user1.getAddress()
            );
            const pendingRewards = await chef.pendingReward(
                await user1.getAddress()
            );

            expect(totalClaimable).to.equal(heldRewards + pendingRewards);
        });

        it("should correctly report lock status", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            expect(await chef.isInLockPeriod(await user1.getAddress())).to.be
                .true;

            // Skip to after lock period
            const lockEndBlock = await chef.getLockEndBlock(
                await user1.getAddress()
            );
            await skipToBlock(Number(lockEndBlock) + 1);

            expect(await chef.isInLockPeriod(await user1.getAddress())).to.be
                .false;
        });
    });

    describe("Edge Cases", () => {
        it("should handle zero deposits correctly", async function () {
            await expect(chef.connect(user1).deposit(0)).to.not.be.reverted;

            const userInfo = await chef.userInfo(await user1.getAddress());
            expect(userInfo.amount).to.equal(0);
        });

        it("should handle partial withdrawals after lock expires", async function () {
            const depositAmount = ethers.parseEther("100");
            const withdrawAmount = ethers.parseEther("40");

            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);
            await chef.connect(user1).deposit(depositAmount);

            // Skip to after lock period
            const lockEndBlock = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            await skipToBlock(Number(lockEndBlock) + 1);

            await chef.connect(user1).withdraw(withdrawAmount);

            const userInfo = await chef.userInfo(await user1.getAddress());
            expect(userInfo.amount).to.equal(depositAmount - withdrawAmount);
        });

        it("should handle claiming rewards multiple times", async function () {
            const depositAmount = ethers.parseEther("100");
            await token
                .connect(user1)
                .approve(await chef.getAddress(), depositAmount);

            await chef.connect(user1).deposit(depositAmount);

            // Skip to after lock period and accumulate rewards
            await skipToBlock(config.startBlock + 1);
            const lockEndBlock = (await chef.userInfo(await user1.getAddress()))
                .lockEndBlock;
            await skipToBlock(Number(lockEndBlock) + 50);

            // First claim
            await chef.connect(user1).claimRewards();

            // Mine more blocks and claim again
            await mineBlocks(50);
            await chef.connect(user1).claimRewards();

            // Should not revert and user should receive more rewards
            const userInfo = await chef.userInfo(await user1.getAddress());
            expect(userInfo.heldRewards).to.equal(0);
        });
    });
});
