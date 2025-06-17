import { expect } from "chai";
import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
    TokenMigrater,
    IAIToken,
    VRFIToken,
    MockERC20,
} from "../typechain-types";

describe("TokenMigrater", function () {
    let tokenMigrater: TokenMigrater;
    let sourceToken: IAIToken;
    let targetToken: VRFIToken;
    let owner: SignerWithAddress;
    let treasury: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;

    const INITIAL_SUPPLY = ethers.parseEther("1000000"); // 1M tokens
    const DEFAULT_MIGRATION_LIMIT = ethers.parseEther("10000"); // 10K tokens

    beforeEach(async function () {
        [owner, treasury, user1, user2] = await ethers.getSigners();

        // Deploy Source Token (IAI)
        const SourceTokenFactory = await ethers.getContractFactory("IAIToken");
        sourceToken = (await SourceTokenFactory.deploy(
            owner.address,
            INITIAL_SUPPLY
        )) as IAIToken;

        // Deploy Target Token (VRFI)
        const TargetTokenFactory = await ethers.getContractFactory("VRFIToken");
        targetToken = (await TargetTokenFactory.deploy(
            owner.address,
            INITIAL_SUPPLY
        )) as VRFIToken;

        // Deploy TokenMigrater
        const TokenMigraterFactory = await ethers.getContractFactory(
            "TokenMigrater"
        );
        tokenMigrater = (await TokenMigraterFactory.deploy(
            await sourceToken.getAddress(),
            await targetToken.getAddress(),
            treasury.address,
            DEFAULT_MIGRATION_LIMIT,
            owner.address
        )) as TokenMigrater;

        // Transfer some target tokens to the migrator contract
        await targetToken.transfer(
            await tokenMigrater.getAddress(),
            ethers.parseEther("100000")
        );

        // Transfer some source tokens to users for testing
        await sourceToken.transfer(user1.address, ethers.parseEther("50000"));
        await sourceToken.transfer(user2.address, ethers.parseEther("50000"));
    });

    describe("Deployment", function () {
        it("Should set the right parameters", async function () {
            expect(await tokenMigrater.sourceToken()).to.equal(
                await sourceToken.getAddress()
            );
            expect(await tokenMigrater.targetToken()).to.equal(
                await targetToken.getAddress()
            );
            expect(await tokenMigrater.treasuryWallet()).to.equal(
                treasury.address
            );
            expect(await tokenMigrater.defaultMigrationLimit()).to.equal(
                DEFAULT_MIGRATION_LIMIT
            );
            expect(await tokenMigrater.migrationPaused()).to.equal(false);
        });

        it("Should revert if tokens have different decimals", async function () {
            // Deploy a mock token with different decimals
            const MockTokenFactory = await ethers.getContractFactory(
                "MockERC20"
            );
            const mockToken = (await MockTokenFactory.deploy(
                "Mock Token",
                "MOCK",
                6,
                ethers.parseEther("1000000")
            )) as MockERC20; // 6 decimals instead of 18

            const TokenMigraterFactory = await ethers.getContractFactory(
                "TokenMigrater"
            );

            // Should revert when trying to deploy with different decimals
            await expect(
                TokenMigraterFactory.deploy(
                    await sourceToken.getAddress(), // 18 decimals
                    await mockToken.getAddress(), // 6 decimals
                    treasury.address,
                    DEFAULT_MIGRATION_LIMIT,
                    owner.address
                )
            ).to.be.revertedWithCustomError(
                TokenMigraterFactory,
                "DecimalMismatch"
            );
        });
    });

    describe("Migration", function () {
        it("Should allow users to migrate tokens", async function () {
            const migrationAmount = ethers.parseEther("1000");

            // Approve source tokens for migration
            await sourceToken
                .connect(user1)
                .approve(await tokenMigrater.getAddress(), migrationAmount);

            // Perform migration
            await expect(tokenMigrater.connect(user1).migrate(migrationAmount))
                .to.emit(tokenMigrater, "Migration")
                .withArgs(user1.address, migrationAmount, migrationAmount);

            // Check balances
            expect(await sourceToken.balanceOf(treasury.address)).to.equal(
                migrationAmount
            );
            expect(await targetToken.balanceOf(user1.address)).to.equal(
                migrationAmount
            );
            expect(
                await tokenMigrater.walletMigratedAmount(user1.address)
            ).to.equal(migrationAmount);
        });

        it("Should enforce migration limits", async function () {
            const migrationAmount = ethers.parseEther("15000"); // More than default limit

            // Approve source tokens for migration
            await sourceToken
                .connect(user1)
                .approve(await tokenMigrater.getAddress(), migrationAmount);

            // Should revert due to limit exceeded
            await expect(
                tokenMigrater.connect(user1).migrate(migrationAmount)
            ).to.be.revertedWithCustomError(
                tokenMigrater,
                "MigrationLimitExceeded"
            );
        });

        it("Should respect default migration limit", async function () {
            const migrationAmount = ethers.parseEther("15000"); // More than default limit

            // Approve source tokens for migration
            await sourceToken
                .connect(user1)
                .approve(await tokenMigrater.getAddress(), migrationAmount);

            // Should revert due to limit exceeded
            await expect(
                tokenMigrater.connect(user1).migrate(migrationAmount)
            ).to.be.revertedWithCustomError(
                tokenMigrater,
                "MigrationLimitExceeded"
            );
        });

        it("Should fail when migration is paused", async function () {
            const migrationAmount = ethers.parseEther("1000");

            // Pause migration
            await tokenMigrater.pauseMigration(true);

            // Approve source tokens for migration
            await sourceToken
                .connect(user1)
                .approve(await tokenMigrater.getAddress(), migrationAmount);

            // Should revert due to paused migration
            await expect(
                tokenMigrater.connect(user1).migrate(migrationAmount)
            ).to.be.revertedWithCustomError(tokenMigrater, "MigrationIsPaused");
        });
    });

    describe("Admin Functions", function () {
        it("Should allow owner to pause migration", async function () {
            await expect(tokenMigrater.pauseMigration(true))
                .to.emit(tokenMigrater, "MigrationPaused")
                .withArgs(true);

            expect(await tokenMigrater.migrationPaused()).to.equal(true);
        });

        it("Should allow owner to change treasury wallet", async function () {
            const newTreasury = user2.address;

            await expect(tokenMigrater.setTreasuryWallet(newTreasury))
                .to.emit(tokenMigrater, "TreasuryWalletUpdated")
                .withArgs(treasury.address, newTreasury);

            expect(await tokenMigrater.treasuryWallet()).to.equal(newTreasury);
        });

        it("Should allow owner to change default migration limit", async function () {
            const newLimit = ethers.parseEther("5000");

            await expect(tokenMigrater.setDefaultMigrationLimit(newLimit))
                .to.emit(tokenMigrater, "DefaultMigrationLimitUpdated")
                .withArgs(DEFAULT_MIGRATION_LIMIT, newLimit);

            expect(await tokenMigrater.defaultMigrationLimit()).to.equal(
                newLimit
            );
        });

        it("Should not allow non-owner to call admin functions", async function () {
            await expect(
                tokenMigrater.connect(user1).pauseMigration(true)
            ).to.be.revertedWithCustomError(
                tokenMigrater,
                "OwnableUnauthorizedAccount"
            );

            await expect(
                tokenMigrater.connect(user1).setTreasuryWallet(user2.address)
            ).to.be.revertedWithCustomError(
                tokenMigrater,
                "OwnableUnauthorizedAccount"
            );

            await expect(
                tokenMigrater
                    .connect(user1)
                    .setDefaultMigrationLimit(ethers.parseEther("5000"))
            ).to.be.revertedWithCustomError(
                tokenMigrater,
                "OwnableUnauthorizedAccount"
            );
        });
    });

    describe("View Functions", function () {
        it("Should return correct remaining migration amount", async function () {
            const migrationAmount = ethers.parseEther("3000");

            // Initially should be full limit
            expect(
                await tokenMigrater.getRemainingMigrationAmount(user1.address)
            ).to.equal(DEFAULT_MIGRATION_LIMIT);

            // After migration, should be reduced
            await sourceToken
                .connect(user1)
                .approve(await tokenMigrater.getAddress(), migrationAmount);
            await tokenMigrater.connect(user1).migrate(migrationAmount);

            expect(
                await tokenMigrater.getRemainingMigrationAmount(user1.address)
            ).to.equal(DEFAULT_MIGRATION_LIMIT - migrationAmount);
        });

        it("Should correctly check if migration is possible", async function () {
            const migrationAmount = ethers.parseEther("1000");

            // Should be possible initially
            expect(
                await tokenMigrater.canMigrate(user1.address, migrationAmount)
            ).to.equal(true);

            // Should not be possible when paused
            await tokenMigrater.pauseMigration(true);
            expect(
                await tokenMigrater.canMigrate(user1.address, migrationAmount)
            ).to.equal(false);

            // Should not be possible with amount exceeding limit
            await tokenMigrater.pauseMigration(false);
            const largeAmount = ethers.parseEther("15000");
            expect(
                await tokenMigrater.canMigrate(user1.address, largeAmount)
            ).to.equal(false);
        });
    });
});
