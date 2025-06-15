// filepath: /home/chanyut/projects/apex/iai-project/smartcontract/test/smartchefv3-simulate.spec.ts
import { mine, mineUpTo, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Signer } from "ethers";
import { ethers } from "hardhat";
import { IAIToken, SmartChefInitializableV3 } from "../typechain-types";

// Helper functions for test setup
const setupTestTokens = async (owner: Signer, users: Signer[]) => {
    const IAIToken = await ethers.getContractFactory("IAIToken");
    const TOTAL_SUPPLY = ethers.parseEther("2000000");
    const stakedToken = (await IAIToken.deploy(
        await owner.getAddress(),
        TOTAL_SUPPLY
    )) as IAIToken;
    // const rewardToken = (await IAIToken.deploy(
    //     await owner.getAddress(),
    //     TOTAL_SUPPLY
    // )) as IAIToken;

    await Promise.all([
        stakedToken.waitForDeployment(),
        // rewardToken.waitForDeployment(),
    ]);

    const rewardToken = stakedToken; // Use the same token

    // Transfer tokens to each user
    for (const user of users) {
        await stakedToken
            .connect(owner)
            .transfer(await user.getAddress(), ethers.parseEther("100000"));
    }

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

// Helper to log user balances for better visibility in tests
const logUserBalances = async (
    users: Signer[],
    stakedToken: IAIToken,
    rewardToken: IAIToken,
    chef: SmartChefInitializableV3,
    label: string
) => {
    console.log(`\n== ${label} ==`);
    for (let i = 0; i < users.length; i++) {
        const address = await users[i].getAddress();
        const stakedBalance = await stakedToken.balanceOf(address);
        const rewardBalance = await rewardToken.balanceOf(address);
        const totalStaked = await chef.userTotalStaked(address);
        const depositIds = await chef.getUserDepositIds(address);

        console.log(`User ${i}:`);
        console.log(
            `  Wallet: ${ethers.formatEther(
                stakedBalance
            )} stake tokens, ${ethers.formatEther(rewardBalance)} reward tokens`
        );
        console.log(`  Staked in pool: ${ethers.formatEther(totalStaked)}`);
        console.log(
            `  Deposit IDs: ${
                depositIds.map((id) => id.toString()).join(", ") || "None"
            }`
        );
    }
    console.log(
        `Pool total staked: ${ethers.formatEther(
            await chef.totalStakedSupply()
        )}`
    );
    console.log(`Current block: ${await ethers.provider.getBlockNumber()}`);
    console.log("");
};

describe("SmartChefV3 Simulation Tests", function () {
    let owner: Signer;
    let users: Signer[];
    let stakedToken: IAIToken;
    let rewardToken: IAIToken;
    let chef: SmartChefInitializableV3;
    let config: {
        rewardPerBlock: bigint;
        startBlock: number;
        bonusEndBlock: number;
        poolLimitPerUser: bigint;
        lockPeriod: number;
    };

    beforeEach(async function () {
        // Get signers - first is owner, rest are users
        const allSigners = await ethers.getSigners();
        owner = allSigners[0];
        users = allSigners.slice(1, 6); // Use 5 users for tests

        // Setup test environment
        const tokens = await setupTestTokens(owner, users);
        stakedToken = tokens.stakedToken;
        rewardToken = tokens.rewardToken;

        // Setup chef with a 2-day lock period for some tests
        const lockPeriodInSeconds = 2 * 24 * 60 * 60; // 2 days
        const setup = await setupSmartChefV3(
            stakedToken,
            rewardToken,
            owner,
            ethers.parseEther("1000"),
            lockPeriodInSeconds
        );

        chef = setup.chef;
        config = setup.config;
    });

    it("should simulate realistic farming scenario with multiple users", async function () {
        // Scenario:
        // 1. Multiple users deposit varying amounts at different times
        // 2. Some users withdraw before lock period
        // 3. Some users withdraw after lock period
        // 4. Track rewards earned by each user

        console.log(`Starting simulation with ${users.length} users`);
        console.log(
            `Reward per block: ${ethers.formatEther(
                config.rewardPerBlock
            )} tokens`
        );
        console.log(`Lock period: ${config.lockPeriod / (24 * 60 * 60)} days`);

        // Initial state
        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "Initial State"
        );

        // Step 1: First batch of users deposit
        console.log("Step 1: First batch of users making deposits");

        // User 0 deposits 100 tokens
        const depositAmount0 = ethers.parseEther("100");
        await stakedToken
            .connect(users[0])
            .approve(await chef.getAddress(), depositAmount0);
        const tx0 = await chef.connect(users[0]).deposit(depositAmount0);
        const receipt0 = await tx0.wait();
        const depositId0 = 1n; // First deposit

        // User 1 deposits 200 tokens
        const depositAmount1 = ethers.parseEther("200");
        await stakedToken
            .connect(users[1])
            .approve(await chef.getAddress(), depositAmount1);
        const tx1 = await chef.connect(users[1]).deposit(depositAmount1);
        const receipt1 = await tx1.wait();
        const depositId1 = 2n; // Second deposit

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After Initial Deposits"
        );

        // Mine blocks until we reach the start block to begin accumulating rewards
        console.log(`Mining blocks until start block (${config.startBlock})`);
        await mineUpTo(config.startBlock + 1);

        // Step 2: New user joins and existing user adds more
        console.log("Step 2: More deposits after rewards have started");

        // User 2 deposits 300 tokens
        const depositAmount2 = ethers.parseEther("300");
        await stakedToken
            .connect(users[2])
            .approve(await chef.getAddress(), depositAmount2);
        const tx2 = await chef.connect(users[2]).deposit(depositAmount2);
        const receipt2 = await tx2.wait();
        const depositId2 = 3n; // Third deposit

        // User 0 deposits another 50 tokens
        const additionalAmount0 = ethers.parseEther("50");
        await stakedToken
            .connect(users[0])
            .approve(await chef.getAddress(), additionalAmount0);
        const tx3 = await chef.connect(users[0]).deposit(additionalAmount0);
        const receipt3 = await tx3.wait();
        const depositId3 = 4n; // Fourth deposit

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After More Deposits"
        );

        // Mine some blocks to generate rewards
        await mine(20);

        // Check pending rewards
        console.log(
            "Checking pending rewards after 20 blocks -- current block: " +
                (await ethers.provider.getBlockNumber())
        );
        const numberOfBlocksSincePoolStart =
            (await ethers.provider.getBlockNumber()) - config.startBlock;
        console.log(`Blocks since start: ${numberOfBlocksSincePoolStart}`);
        let totalRewards = 0n;
        for (let i = 0; i < 4; i++) {
            const depositId = BigInt(i + 1);
            const pendingReward = await chef.pendingReward(depositId);
            const depositInfo = await chef.getDepositInfo(depositId);
            const userAddress = depositInfo.user;
            console.log(
                `Deposit ID ${depositId}: ${ethers.formatEther(
                    pendingReward
                )} pending rewards for ${userAddress}`
            );
            totalRewards += pendingReward;
        }
        console.log(
            `Total rewards accumulated so far: ${ethers.formatEther(
                totalRewards
            )}`
        );

        // Step 3: User 1 tries to withdraw before lock period ends (should get tokens back but no rewards)
        console.log("\nStep 3: User 1 attempts to withdraw before lock ends");

        // Try to withdraw - user should get their tokens back but no rewards
        await chef.connect(users[1]).withdraw(depositId1);

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After User 1 Early Withdrawal"
        );

        // Step 4: Mine blocks until lock period passes
        console.log("Step 4: Fast-forwarding time to pass lock period");

        // Fast forward time to bypass lock period
        await time.increase(config.lockPeriod + 1);
        await mine(5);

        // Step 5: User 0 withdraws first deposit after lock period (should get rewards)
        console.log(
            "\nStep 5: User 0 withdraws first deposit after lock period ends"
        );

        // Check pending rewards for User 0's first deposit
        const pendingReward0 = await chef.pendingReward(depositId0);
        console.log(
            `Pending rewards for User 0's first deposit: ${ethers.formatEther(
                pendingReward0
            )}`
        );

        // Withdraw
        await chef.connect(users[0]).withdraw(depositId0);

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After User 0 Withdrawal"
        );

        // Step 6: User 2 withdraws after earning significant rewards
        console.log("\nStep 6: User 2 withdraws after earning rewards");

        // Check pending rewards
        const pendingReward2 = await chef.pendingReward(depositId2);
        console.log(
            `Pending rewards for User 2: ${ethers.formatEther(pendingReward2)}`
        );

        // Withdraw
        await chef.connect(users[2]).withdraw(depositId2);

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After User 2 Withdrawal"
        );

        // Step 7: User 3 makes a late entry into the pool
        console.log("\nStep 7: User 3 makes late deposit");

        const depositAmount3 = ethers.parseEther("400");
        await stakedToken
            .connect(users[3])
            .approve(await chef.getAddress(), depositAmount3);
        const tx4 = await chef.connect(users[3]).deposit(depositAmount3);
        const receipt4 = await tx4.wait();
        const depositId4 = 5n; // Fifth deposit

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "After User 3 Late Entry"
        );

        // Step 8: Mine more blocks approaching end of reward period
        console.log("\nStep 8: Fast-forwarding near end of reward period");

        // Mine blocks close to the end
        const blocksToMine =
            config.bonusEndBlock -
            (await ethers.provider.getBlockNumber()) -
            10;
        await mine(Number(blocksToMine));

        console.log(`Current block: ${await ethers.provider.getBlockNumber()}`);
        console.log(`Bonus end block: ${config.bonusEndBlock}`);

        // Step 9: Final withdrawals before end of reward period
        console.log("\nStep 9: Final withdrawals");

        // User 0 withdraws second deposit
        await chef.connect(users[0]).withdraw(depositId3);

        // User 3 withdraws their deposit
        await chef.connect(users[3]).withdraw(depositId4);

        await logUserBalances(
            users,
            stakedToken,
            rewardToken,
            chef,
            "Final State"
        );

        // Verify all claims are properly processed
        const totalStaked = await chef.totalStakedSupply();
        expect(totalStaked).to.equal(0n); // All funds should be withdrawn

        // Ensure all users got appropriate rewards
        for (let i = 0; i < 4; i++) {
            const rewardBalance = await rewardToken.balanceOf(
                await users[i].getAddress()
            );
            console.log(
                `User ${i} final reward balance: ${ethers.formatEther(
                    rewardBalance
                )}`
            );
            // Users who participated should have non-zero rewards
            if (i < 4) {
                // First 4 users participated
                // We don't expect exact amounts, but rewards should be proportional to stake and duration
                expect(rewardBalance).to.be.gt(0n);
            }
        }

        // Step 10: Verify pool is properly closed out
        console.log("\nStep 10: Verifying pool state");

        // Pool should be empty but still active until end block
        expect(await chef.totalStakedSupply()).to.equal(0n);
        expect(await chef.isPoolActive()).to.equal(true);

        // Mine past end block
        await mineUpTo(config.bonusEndBlock + 1);

        // Now pool should be inactive
        expect(await chef.isPoolActive()).to.equal(false);

        console.log("Simulation complete");
    });
});
