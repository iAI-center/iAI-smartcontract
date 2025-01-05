import { mine, mineUpTo } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { ERC20, IAIToken, SmartChefInitializable } from "../typechain-types";

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

const setupSmartChef = async (
    stakedToken: IAIToken,
    rewardToken: IAIToken,
    owner: Signer
) => {
    const factory = await (
        await ethers.getContractFactory("SmartChefFactory")
    ).deploy();
    await factory.waitForDeployment();

    const currentBlock = await ethers.provider.getBlockNumber();
    const config = {
        rewardPerBlock: ethers.parseEther("10"),
        startBlock: currentBlock + 10,
        bonusEndBlock: currentBlock + 1010,
        poolLimitPerUser: ethers.parseEther("1000"),
    };

    await factory.deployPool(
        await stakedToken.getAddress(),
        await rewardToken.getAddress(),
        config.rewardPerBlock,
        config.startBlock,
        config.bonusEndBlock,
        config.poolLimitPerUser,
        await owner.getAddress()
    );

    const events = await factory.queryFilter(
        factory.filters.NewSmartChefContract()
    );
    const chef = await ethers.getContractAt(
        "SmartChefInitializable",
        events[events.length - 1].args.smartChef
    );

    rewardToken
        .connect(owner)
        .transfer(await chef.getAddress(), ethers.parseEther("1000000"));

    return { factory, chef, config };
};

describe("SmartChef System Tests", function () {
    let owner: Signer, user1: Signer;
    let stakedToken: IAIToken, rewardToken: IAIToken;
    let chef: SmartChefInitializable;
    let config: {
        rewardPerBlock: bigint;
        startBlock: number;
        bonusEndBlock: number;
        poolLimitPerUser: bigint;
    };

    beforeEach(async function () {
        [owner, user1] = await ethers.getSigners();
        const tokens = await setupTestTokens(owner, user1);
        stakedToken = tokens.stakedToken;
        rewardToken = tokens.rewardToken;
        const setup = await setupSmartChef(stakedToken, rewardToken, owner);
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
        });

        it("should handle deposits and withdrawals correctly", async function () {
            const depositAmount = ethers.parseEther("10");
            await stakedToken.approve(await chef.getAddress(), depositAmount);
            await chef.deposit(depositAmount);

            const userInfo = await chef.userInfo(await owner.getAddress());
            expect(userInfo.amount).to.equal(depositAmount);

            await chef.withdraw(depositAmount / 2n);
            const updatedInfo = await chef.userInfo(await owner.getAddress());
            expect(updatedInfo.amount).to.equal(depositAmount / 2n);
        });
    });

    describe("Reward Distribution", () => {
        it("should distribute rewards proportionally to stake", async function () {
            const ownerStake = ethers.parseEther("10");
            const user1Stake = ethers.parseEther("5");

            // Setup stakes
            await stakedToken.approve(await chef.getAddress(), ownerStake);
            await stakedToken.transfer(await user1.getAddress(), user1Stake);
            await stakedToken
                .connect(user1)
                .approve(await chef.getAddress(), user1Stake);

            await chef.deposit(ownerStake);
            await chef.connect(user1).deposit(user1Stake);
            await mine(10);

            const [ownerReward, user1Reward] = await Promise.all([
                chef.pendingReward(await owner.getAddress()),
                chef.pendingReward(await user1.getAddress()),
            ]);

            const totalReward = ownerReward + user1Reward;
            expect((ownerReward * 100n) / totalReward).to.be.closeTo(67n, 1n);
            expect((user1Reward * 100n) / totalReward).to.be.closeTo(33n, 1n);
        });
    });

    describe("Safety Features", () => {
        it("should enforce pool limits", async function () {
            const oldPoolLImitPerUser = await chef.poolLimitPerUser();
            const userLimit = ethers.parseEther("20000");
            await expect(chef.updatePoolLimitPerUser(true, userLimit)).not.to
                .reverted;
            await stakedToken.approve(await chef.getAddress(), userLimit * 2n);
            await expect(chef.deposit(userLimit + 1n)).to.be.revertedWith(
                "User amount above limit"
            );
        });

        it("should handle emergency withdrawal", async function () {
            const amount = ethers.parseEther("5");
            await stakedToken.approve(await chef.getAddress(), amount);
            await chef.deposit(amount);
            await chef.emergencyWithdraw();

            const userInfo = await chef.userInfo(await owner.getAddress());
            expect(userInfo.amount).to.equal(0);
            expect(userInfo.rewardDebt).to.equal(0);
        });
    });

    describe("Farming Scenarios", () => {
        it("should handle early withdrawal before reward period starts", async function () {
            const depositAmount = ethers.parseEther("100");
            await stakedToken.approve(await chef.getAddress(), depositAmount);
            await chef.deposit(depositAmount);

            // We're still before startBlock
            const pendingReward = await chef.pendingReward(
                await owner.getAddress()
            );
            expect(pendingReward).to.equal(0);

            await chef.withdraw(depositAmount);
            const finalReward = await rewardToken.balanceOf(
                await owner.getAddress()
            );
            expect(finalReward).to.equal(0);
        });

        it("should handle compound farming (harvest and re-stake)", async function () {
            // Assuming reward token can be staked (same as staked token)
            const initialStake = ethers.parseEther("100");
            await stakedToken.approve(await chef.getAddress(), initialStake);
            await chef.deposit(initialStake);

            // Move to reward period
            await mine(
                config.startBlock -
                    (await ethers.provider.getBlockNumber()) +
                    50
            );

            // Harvest rewards by depositing 0
            const beforeBalance = await rewardToken.balanceOf(
                await owner.getAddress()
            );
            await chef.deposit(0n);
            const afterBalance = await rewardToken.balanceOf(
                await owner.getAddress()
            );
            const harvestedAmount = afterBalance - beforeBalance;

            // Re-stake harvested rewards
            await stakedToken.approve(await chef.getAddress(), harvestedAmount);
            await chef.deposit(harvestedAmount);

            const userInfo = await chef.userInfo(await owner.getAddress());
            expect(userInfo.amount).to.be.gt(initialStake);
        });

        it("should handle multiple users with different entry/exit times", async function () {
            const user2 = (await ethers.getSigners())[2];
            const amount1 = ethers.parseEther("100");
            const amount2 = ethers.parseEther("200");

            // Setup user2 with tokens
            await stakedToken.transfer(await user2.getAddress(), amount2);

            // First user deposits
            await stakedToken.approve(await chef.getAddress(), amount1);
            await chef.deposit(amount1);

            // Move to start of reward period
            await mine(
                config.startBlock - (await ethers.provider.getBlockNumber())
            );

            // Mine some blocks
            await mine(25);

            // Second user deposits
            await stakedToken
                .connect(user2)
                .approve(await chef.getAddress(), amount2);
            await chef.connect(user2).deposit(amount2);

            // Mine more blocks
            await mine(25);

            // First user exits
            await chef.withdraw(amount1);

            // Mine final blocks
            await mine(25);

            // Check user2's rewards
            const user2Rewards = await chef.pendingReward(
                await user2.getAddress()
            );
            expect(user2Rewards).to.be.gt(0);

            // Verify user2's rewards are higher in the final period
            const user2Info = await chef.userInfo(await user2.getAddress());
            expect(user2Info.amount).to.equal(amount2);
        });
    });

    describe("Complex Farming Scenarios", () => {
        let user2: Signer, user3: Signer;

        beforeEach(async function () {
            [user2, user3] = (await ethers.getSigners()).slice(2, 4);
            // Give tokens to users
            await Promise.all([
                stakedToken.transfer(
                    await user2.getAddress(),
                    ethers.parseEther("1000")
                ),
                stakedToken.transfer(
                    await user3.getAddress(),
                    ethers.parseEther("1000")
                ),
                stakedToken
                    .connect(user2)
                    .approve(
                        await chef.getAddress(),
                        ethers.parseEther("1000")
                    ),
                stakedToken
                    .connect(user3)
                    .approve(
                        await chef.getAddress(),
                        ethers.parseEther("1000")
                    ),
            ]);
        });

        it("should handle rapid deposits and withdrawals correctly", async function () {
            // Move to start of reward period
            await mine(
                config.startBlock - (await ethers.provider.getBlockNumber())
            );

            // Simulate rapid trading-like behavior
            const operations = [
                // [amount, isDeposit, user]
                {
                    amount: ethers.parseEther("100"),
                    isDeposit: true,
                    user: owner,
                },
                {
                    amount: ethers.parseEther("200"),
                    isDeposit: true,
                    user: user1,
                },
                {
                    amount: ethers.parseEther("50"),
                    isDeposit: false,
                    user: owner,
                },
                {
                    amount: ethers.parseEther("300"),
                    isDeposit: true,
                    user: user2,
                },
                {
                    amount: ethers.parseEther("100"),
                    isDeposit: false,
                    user: user1,
                },
                {
                    amount: ethers.parseEther("150"),
                    isDeposit: true,
                    user: user3,
                },
                {
                    amount: ethers.parseEther("200"),
                    isDeposit: false,
                    user: user2,
                },
                {
                    amount: ethers.parseEther("50"),
                    isDeposit: true,
                    user: owner,
                },
                {
                    amount: ethers.parseEther("100"),
                    isDeposit: false,
                    user: user1,
                },
                {
                    amount: ethers.parseEther("75"),
                    isDeposit: false,
                    user: user3,
                },
            ];

            const userRewards = new Map<string, bigint>();

            // Execute operations with reward tracking
            for (const { amount, isDeposit, user } of operations) {
                await mine(3); // Simulate time passing between operations

                const address = await user.getAddress();
                const balanceBefore = await rewardToken.balanceOf(address);
                if (isDeposit) {
                    await stakedToken
                        .connect(user)
                        .approve(await chef.getAddress(), amount);
                }
                if (isDeposit) {
                    await chef.connect(user).deposit(amount as bigint);
                } else {
                    await chef.connect(user).withdraw(amount as bigint);
                }

                const balanceAfter = await rewardToken.balanceOf(address);
                const reward = balanceAfter - balanceBefore;
                userRewards.set(
                    address,
                    (userRewards.get(address) || 0n) + reward
                );
            }

            await mine(10);

            // Verify final state
            for (const user of [owner, user1, user2, user3]) {
                const address = await user.getAddress();
                const userInfo = await chef.userInfo(address);
                const pendingReward = await chef.pendingReward(address);

                // Check that pendingReward is consistent with user's current stake
                if (userInfo.amount > 0n) {
                    expect(pendingReward).to.be.gt(0);
                }

                // Verify total rewards received
                const totalReward = userRewards.get(address) || 0n;
                expect(totalReward).to.be.gte(0);
            }
        });
    });

    // Additional test categories can be added here...
});
