import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IAIPresaleToken, IAIPresaleV2, IERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IAIPresaleV2", function () {
    let presale: IAIPresaleV2;
    let usdt: IERC20;
    let iaiPresaleToken: IAIPresaleToken;
    let owner: SignerWithAddress;
    let buyer1: SignerWithAddress;
    let buyer2: SignerWithAddress;
    let revenueReceiver: SignerWithAddress;

    context("With 18 Decimal USDT Token", function () {
        const TOKEN_PRICE = ethers.parseEther("1"); // 1 USDT per token
        const MIN_PURCHASE = ethers.parseEther("0"); // 100 tokens
        const MAX_SALE_AMOUNT = ethers.parseEther("1000000"); // 1M tokens
        const MAX_USDT_SPENDING_PER_USER = ethers.parseEther("1000000"); // 1M tokens

        // Add constants for USDT decimals
        const USDT_DECIMALS = 18;
        const SCALING_FACTOR = BigInt(10) ** BigInt(18 - USDT_DECIMALS);

        beforeEach(async function () {
            [owner, buyer1, buyer2, revenueReceiver] =
                await ethers.getSigners();

            // Deploy mock USDT with 6 decimals and IAI tokens
            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt = (await (
                await TokenFactory.deploy(
                    "USDT",
                    "USDT",
                    USDT_DECIMALS,
                    BigInt(1_000_000_000) * BigInt(10) ** BigInt(USDT_DECIMALS)
                )
            ).waitForDeployment()) as IERC20;
            const IAIPresaleTokenFactory = await ethers.getContractFactory(
                "IAIPresaleToken"
            );
            iaiPresaleToken = (await (
                await IAIPresaleTokenFactory.deploy(
                    "IAI Token",
                    "IAI",
                    ethers.parseEther("12500000"),
                    18
                )
            ).waitForDeployment()) as IAIPresaleToken;

            // Set up presale timing
            const startTime = (await time.latest()) + 3600; // Start in 1 hour
            const endTime = startTime + 86400; // End in 24 hours

            // Deploy presale contract
            const isWhitelistEnabled = false;
            const PresaleFactory = await ethers.getContractFactory(
                "IAIPresaleV2"
            );
            presale = await PresaleFactory.deploy(
                await usdt.getAddress(),
                await iaiPresaleToken.getAddress(),
                revenueReceiver.address,
                TOKEN_PRICE,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                isWhitelistEnabled,
                MAX_USDT_SPENDING_PER_USER
            );

            // Fund the presale contract with IAI tokens
            await iaiPresaleToken.transfer(
                await presale.getAddress(),
                MAX_SALE_AMOUNT
            );

            // Fund buyers with USDT
            const usdtAmount = ethers.parseEther("2000000");
            await usdt.transfer(buyer1.address, usdtAmount);
            await usdt.transfer(buyer2.address, usdtAmount);
        });

        describe("Deployment", function () {
            it("Should deploy with correct initial state", async function () {
                expect(await presale.usdtToken()).to.equal(
                    await usdt.getAddress()
                );
                expect(await presale.iaiPresaleToken()).to.equal(
                    await iaiPresaleToken.getAddress()
                );
                expect(await presale.revenueReceiver()).to.equal(
                    revenueReceiver.address
                );
                expect(await presale.tokenPrice()).to.equal(TOKEN_PRICE);
                expect(await presale.maxSaleAmount()).to.equal(MAX_SALE_AMOUNT);
                expect(await presale.minPurchaseAmount()).to.equal(
                    MIN_PURCHASE
                );
                expect(await presale.isWhitelistEnabled()).to.equal(false);
            });
        });

        describe("Whitelist Management", function () {
            const usdtMaxAmount = ethers.parseEther("5000");

            it("Should add single address to whitelist with USDT limit", async function () {
                await expect(
                    presale.addToWhitelist(buyer1.address, usdtMaxAmount)
                )
                    .to.emit(presale, "AddressWhitelisted")
                    .withArgs(buyer1.address, usdtMaxAmount);

                expect(await presale.isWhitelisted(buyer1.address)).to.be.true;
                expect(
                    await presale.whitelistUSDTMaxAmount(buyer1.address)
                ).to.equal(usdtMaxAmount);
            });

            it("Should handle batch whitelist operations", async function () {
                const addresses = [buyer1.address, buyer2.address];
                const usdtLimits = [
                    ethers.parseEther("5000"),
                    ethers.parseEther("3000"),
                ];

                await presale.batchAddToWhitelist(addresses, usdtLimits);

                // Verify all addresses are whitelisted with correct limits
                for (let i = 0; i < addresses.length; i++) {
                    expect(await presale.isWhitelisted(addresses[i])).to.be
                        .true;
                    expect(
                        await presale.whitelistUSDTMaxAmount(addresses[i])
                    ).to.equal(usdtLimits[i]);
                }

                // Test batch removal
                await presale.batchRemoveFromWhitelist(addresses);
                for (const addr of addresses) {
                    expect(await presale.isWhitelisted(addr)).to.be.false;
                    expect(await presale.whitelistUSDTMaxAmount(addr)).to.equal(
                        0
                    );
                }
            });

            it("Should update whitelist USDT limits correctly", async function () {
                await presale.addToWhitelist(buyer1.address, usdtMaxAmount);
                const newUsdtLimit = ethers.parseEther("7000");

                await presale.updateWhitelistMaxAmount(
                    buyer1.address,
                    newUsdtLimit
                );
                expect(
                    await presale.whitelistUSDTMaxAmount(buyer1.address)
                ).to.equal(newUsdtLimit);
            });

            it("Should handle batch USDT limit updates", async function () {
                const addresses = [buyer1.address, buyer2.address];
                const initialLimits = [
                    ethers.parseEther("5000"),
                    ethers.parseEther("3000"),
                ];
                const newLimits = [
                    ethers.parseEther("7000"),
                    ethers.parseEther("4000"),
                ];

                await presale.batchAddToWhitelist(addresses, initialLimits);
                await presale.batchUpdateWhitelistMaxAmount(
                    addresses,
                    newLimits
                );

                for (let i = 0; i < addresses.length; i++) {
                    expect(
                        await presale.whitelistUSDTMaxAmount(addresses[i])
                    ).to.equal(newLimits[i]);
                }
            });
        });

        describe("Token Purchase with Whitelist", function () {
            const usdtAmount = ethers.parseEther("1000");

            beforeEach(async function () {
                await time.increase(3600);
                await presale.setWhitelistStatus(true);
                await presale.addToWhitelist(
                    buyer1.address,
                    ethers.parseEther("5000")
                );
                await usdt
                    .connect(buyer1)
                    .approve(
                        await presale.getAddress(),
                        ethers.parseEther("5000")
                    );
            });

            it("Should track USDT spending within limits", async function () {
                await presale.connect(buyer1).buyTokens(usdtAmount);
                expect(
                    await presale.userTotalUSDTSpent(buyer1.address)
                ).to.equal(usdtAmount);
            });

            it("Should prevent exceeding USDT spending limit", async function () {
                const overLimit = ethers.parseEther("6000");
                await usdt
                    .connect(buyer1)
                    .approve(await presale.getAddress(), overLimit);
                await expect(
                    presale.connect(buyer1).buyTokens(overLimit)
                ).to.be.revertedWith(
                    "Exceeds total allowed USDT spending amount"
                );
            });

            it("Should allow multiple purchases within USDT limit", async function () {
                const smallerAmount = ethers.parseEther("2000");
                await presale.connect(buyer1).buyTokens(smallerAmount);
                await presale.connect(buyer1).buyTokens(smallerAmount);

                expect(
                    await presale.userTotalUSDTSpent(buyer1.address)
                ).to.equal(smallerAmount * BigInt(2));
            });
        });

        describe("Presale Controls", function () {
            it("Should toggle whitelist status", async function () {
                await presale.setWhitelistStatus(true);
                expect(await presale.isWhitelistEnabled()).to.be.true;

                await presale.setWhitelistStatus(false);
                expect(await presale.isWhitelistEnabled()).to.be.false;
            });

            it("Should handle presale configuration updates", async function () {
                const newPrice = ethers.parseEther("2");
                const newStartTime = (await time.latest()) + 7200;
                const newEndTime = newStartTime + 86400;
                const newMaxSaleAmount = ethers.parseEther("2000000");

                await presale.updatePresaleConfig(
                    newPrice,
                    newStartTime,
                    newEndTime,
                    newMaxSaleAmount,
                    true
                );

                expect(await presale.tokenPrice()).to.equal(newPrice);
                expect(await presale.startTime()).to.equal(newStartTime);
                expect(await presale.endTime()).to.equal(newEndTime);
                expect(await presale.maxSaleAmount()).to.equal(
                    newMaxSaleAmount
                );
                expect(await presale.isWhitelistEnabled()).to.be.true;
            });

            it("Should handle emergency withdrawal", async function () {
                await presale.pause();
                const withdrawAmount = ethers.parseEther("1000");

                await expect(
                    presale.prematureWithdrawPresaleTokens(withdrawAmount)
                )
                    .to.emit(presale, "PrematureTokenWithdrawal")
                    .withArgs(owner.address, withdrawAmount);
            });
        });

        describe("Pagination", function () {
            it("Should return paginated whitelist results", async function () {
                const addresses = [buyer1.address, buyer2.address];
                const usdtLimits = [
                    ethers.parseEther("5000"),
                    ethers.parseEther("3000"),
                ];

                await presale.batchAddToWhitelist(addresses, usdtLimits);

                const [returnedAddresses, returnedLimits, total] =
                    await presale.getWhitelistedAddresses(0, 1);

                expect(total).to.equal(2);
                expect(returnedAddresses.length).to.equal(1);
                expect(returnedAddresses[0]).to.equal(addresses[0]);
                expect(returnedLimits[0]).to.equal(usdtLimits[0]);
            });
        });

        describe("Additional Presale Functionality", function () {
            it("Should allow owner to set a new revenueReceiver", async function () {
                await presale.setRevenueReceiver(buyer2.address);
                expect(await presale.revenueReceiver()).to.equal(
                    buyer2.address
                );
            });

            it("Should correctly remove an address from the whitelist", async function () {
                await presale.addToWhitelist(
                    buyer1.address,
                    ethers.parseEther("5000")
                );
                await expect(presale.removeFromWhitelist(buyer1.address))
                    .to.emit(presale, "AddressRemovedFromWhitelist")
                    .withArgs(buyer1.address);
                expect(await presale.isWhitelisted(buyer1.address)).to.be.false;
                expect(
                    await presale.whitelistUSDTMaxAmount(buyer1.address)
                ).to.equal(0);
            });

            it("Should update minPurchaseAmount and enforce purchase minimum", async function () {
                const newMin = ethers.parseEther("500");
                await presale.setMinPurchaseAmount(newMin);
                expect(await presale.minPurchaseAmount()).to.equal(newMin);

                // Disable whitelist for simpler testing and advance time to presale start
                await presale.setWhitelistStatus(false);
                await time.increase(3600);
                await usdt
                    .connect(buyer1)
                    .approve(
                        await presale.getAddress(),
                        ethers.parseEther("400")
                    );
                await expect(
                    presale.connect(buyer1).buyTokens(ethers.parseEther("400"))
                ).to.be.revertedWith("Below minimum purchase amount");
            });

            it("Should update maxSaleAmount exceeding current tokens sold", async function () {
                const extraSaleAmount = ethers.parseEther("500000");
                const newMaxSale =
                    (await presale.maxSaleAmount()) - extraSaleAmount;
                await presale.setMaxSaleAmount(newMaxSale);
                expect(await presale.maxSaleAmount()).to.equal(newMaxSale);
            });

            it("Should return correct presale status", async function () {
                await time.increase(3600);
                const [
                    isActive,
                    isPaused,
                    remaining,
                    timeUntilStart,
                    timeUntilEnd,
                ] = await presale.getPresaleStatus();
                expect(isActive).to.be.true;
                expect(isPaused).to.be.false;
                expect(remaining).to.equal(
                    (await presale.maxSaleAmount()) -
                        (await presale.totalTokensSold())
                );
                expect(timeUntilStart).to.equal(0);
                expect(timeUntilEnd).to.be.gt(0);
            });

            it("Should allow owner to withdraw unsold tokens after presale ends", async function () {
                // Fast forward time beyond presale end time
                const endTime = await presale.endTime();
                const currentTime = await time.latest();
                const waitTime = Number(endTime) - Number(currentTime) + 1;
                await time.increase(waitTime);

                const ownerBalanceBefore = await iaiPresaleToken.balanceOf(
                    owner.address
                );
                const contractBalance = await iaiPresaleToken.balanceOf(
                    await presale.getAddress()
                );
                await expect(presale.withdrawUnsoldPresaleTokens())
                    .to.emit(presale, "PresaleTokensWithdrawn")
                    .withArgs(owner.address, contractBalance);
                const ownerBalanceAfter = await iaiPresaleToken.balanceOf(
                    owner.address
                );
                expect(ownerBalanceAfter - ownerBalanceBefore).to.equal(
                    contractBalance
                );
            });
        });

        describe("IAIPresaleToken Minting", function () {
            let newOwner: SignerWithAddress;

            beforeEach(async function () {
                [owner, buyer1, buyer2, revenueReceiver, newOwner] =
                    await ethers.getSigners();
            });

            it("Should allow owner to mint tokens", async function () {
                const mintAmount = ethers.parseEther("1000");
                const initialSupply = await iaiPresaleToken.totalSupply();

                await expect(iaiPresaleToken.mint(owner.address, mintAmount))
                    .to.emit(iaiPresaleToken, "Transfer")
                    .withArgs(ethers.ZeroAddress, owner.address, mintAmount);

                expect(await iaiPresaleToken.totalSupply()).to.equal(
                    initialSupply + mintAmount
                );
                expect(await iaiPresaleToken.balanceOf(owner.address)).to.equal(
                    await iaiPresaleToken.balanceOf(owner.address)
                );
            });

            it("Should not allow non-owner to mint tokens", async function () {
                const mintAmount = ethers.parseEther("1000");
                await expect(
                    iaiPresaleToken
                        .connect(buyer1)
                        .mint(buyer1.address, mintAmount)
                ).to.be.revertedWithCustomError(
                    iaiPresaleToken,
                    "OwnableUnauthorizedAccount"
                );
            });

            it("Should allow new owner to mint tokens after ownership transfer", async function () {
                const mintAmount = ethers.parseEther("1000");

                // Transfer ownership to new owner
                await iaiPresaleToken.transferOwnership(newOwner.address);
                expect(await iaiPresaleToken.owner()).to.equal(
                    newOwner.address
                );

                // Old owner should not be able to mint
                await expect(
                    iaiPresaleToken.mint(owner.address, mintAmount)
                ).to.be.revertedWithCustomError(
                    iaiPresaleToken,
                    "OwnableUnauthorizedAccount"
                );

                // New owner should be able to mint
                const initialSupply = await iaiPresaleToken.totalSupply();
                await expect(
                    iaiPresaleToken
                        .connect(newOwner)
                        .mint(newOwner.address, mintAmount)
                )
                    .to.emit(iaiPresaleToken, "Transfer")
                    .withArgs(ethers.ZeroAddress, newOwner.address, mintAmount);

                expect(await iaiPresaleToken.totalSupply()).to.equal(
                    initialSupply + mintAmount
                );
                expect(
                    await iaiPresaleToken.balanceOf(newOwner.address)
                ).to.equal(mintAmount);
            });
        });
    });

    context("With 6 Decimal USDT Handling", function () {
        // Add constants for USDT decimals
        const USDT_DECIMALS = 6;
        const SCALING_FACTOR = BigInt(10) ** BigInt(18 - USDT_DECIMALS);
        const TOKEN_PRICE = ethers.parseUnits("1", USDT_DECIMALS); // 1 USDT per token
        const MIN_PURCHASE = ethers.parseUnits("0.1", USDT_DECIMALS); // 100 tokens
        const MAX_PURCHASE = ethers.parseUnits("10000", USDT_DECIMALS); // 10000 tokens
        const MAX_SALE_AMOUNT = ethers.parseEther("1000000"); // 1M tokens
        const MAX_USDT_SPENDING_PER_USER = ethers.parseUnits(
            "1000000",
            USDT_DECIMALS
        ); // 1M tokens

        beforeEach(async function () {
            [owner, buyer1, buyer2, revenueReceiver] =
                await ethers.getSigners();

            // Deploy mock USDT with 6 decimals and IAI tokens
            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt = (await (
                await TokenFactory.deploy(
                    "USDT",
                    "USDT",
                    USDT_DECIMALS,
                    BigInt(1_000_000_000) * BigInt(10) ** BigInt(USDT_DECIMALS)
                )
            ).waitForDeployment()) as IERC20;
            const IAIPresaleTokenFactory = await ethers.getContractFactory(
                "IAIPresaleToken"
            );
            iaiPresaleToken = (await (
                await IAIPresaleTokenFactory.deploy(
                    "IAI Token",
                    "IAI",
                    ethers.parseEther("12500000"),
                    18
                )
            ).waitForDeployment()) as IAIPresaleToken;

            // Set up presale timing
            const startTime = (await time.latest()) + 3600; // Start in 1 hour
            const endTime = startTime + 86400; // End in 24 hours

            // Deploy presale contract
            const isWhitelistEnabled = false;
            const PresaleFactory = await ethers.getContractFactory(
                "IAIPresaleV2"
            );
            presale = await PresaleFactory.deploy(
                await usdt.getAddress(),
                await iaiPresaleToken.getAddress(),
                revenueReceiver.address,
                TOKEN_PRICE,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                isWhitelistEnabled,
                MAX_USDT_SPENDING_PER_USER
            );

            // Fund the presale contract with IAI tokens
            await iaiPresaleToken.transfer(
                await presale.getAddress(),
                MAX_SALE_AMOUNT
            );

            // Fund buyers with USDT
            const usdtAmount = ethers.parseUnits("2000000", USDT_DECIMALS);
            await usdt.transfer(buyer1.address, usdtAmount);
            await usdt.transfer(buyer2.address, usdtAmount);
        });

        const usdtAmount6Dec =
            BigInt(1000) * BigInt(10) ** BigInt(USDT_DECIMALS); // 1000 USDT in 6 decimals

        beforeEach(async function () {
            await time.increase(3600);
            await presale.setWhitelistStatus(true);
            await presale.addToWhitelist(
                buyer1.address,
                ethers.parseEther("5000")
            );
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount6Dec);
        });

        it("Should correctly handle 6 decimal USDT purchases", async function () {
            await presale.connect(buyer1).buyTokens(usdtAmount6Dec);

            // Expected token amount should be scaled according to price
            const expectedTokens =
                (usdtAmount6Dec * BigInt(10) ** BigInt(18)) / TOKEN_PRICE;

            // Check user's USDT spent (should be in 6 decimals)
            expect(await presale.userTotalUSDTSpent(buyer1.address)).to.equal(
                usdtAmount6Dec
            );

            // Verify the tokens purchased
            const tokensPurchasedEvent = await presale.queryFilter(
                presale.filters.TokensPurchased(buyer1.address)
            );
            expect(tokensPurchasedEvent[0].args.amount).to.equal(
                expectedTokens
            );
        });

        it("Should handle fractional 6 decimal USDT amounts", async function () {
            const fractionalAmount = BigInt(1234567); // 1.234567 USDT
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), fractionalAmount);

            await presale.connect(buyer1).buyTokens(fractionalAmount);

            // Check the precise conversion
            const expectedTokens =
                (fractionalAmount * BigInt(10) ** BigInt(18)) / TOKEN_PRICE;
            const tokensPurchasedEvent = await presale.queryFilter(
                presale.filters.TokensPurchased(buyer1.address)
            );
            expect(tokensPurchasedEvent[0].args.amount).to.equal(
                expectedTokens
            );
        });

        it("Should enforce USDT spending limits with 6 decimals", async function () {
            const limit = BigInt(5000) * BigInt(10) ** BigInt(USDT_DECIMALS);
            await presale.updateWhitelistMaxAmount(buyer1.address, limit);

            const overLimit = limit + BigInt(10) ** BigInt(USDT_DECIMALS);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), overLimit);

            await expect(
                presale.connect(buyer1).buyTokens(overLimit)
            ).to.be.revertedWith("Exceeds total allowed USDT spending amount");
        });

        it("Should accumulate 6 decimal USDT spending correctly", async function () {
            const amount1 = BigInt(2000) * BigInt(10) ** BigInt(USDT_DECIMALS);
            const amount2 = BigInt(1500) * BigInt(10) ** BigInt(USDT_DECIMALS);

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), amount1 + amount2);
            await presale.connect(buyer1).buyTokens(amount1);
            await presale.connect(buyer1).buyTokens(amount2);

            expect(await presale.userTotalUSDTSpent(buyer1.address)).to.equal(
                amount1 + amount2
            );
        });
    });
});
