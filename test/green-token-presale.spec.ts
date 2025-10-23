import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
// using plain signers in tests (avoid type-only import that may not exist in this workspace)

describe("GREENPresale", function () {
    let presale: any;
    let usdt: any;
    let greenToken: any;
    let owner: any;
    let buyer1: any;
    let buyer2: any;
    let revenueReceiver: any;

    context("With 18 Decimal USDT Token", function () {
        const TOKEN_PRICE = ethers.parseEther("0.06"); // 0.06 USDT per token (example)
        const MIN_PURCHASE = ethers.parseEther("0");
        const MAX_SALE_AMOUNT = ethers.parseEther("12500000");
        const MAX_USDT_SPENDING_PER_USER = ethers.parseEther("1000000");

        const USDT_DECIMALS = 18;

        beforeEach(async function () {
            [owner, buyer1, buyer2, revenueReceiver] =
                await ethers.getSigners();

            // Deploy mock USDT (MockERC20 should exist in repo)
            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt = await TokenFactory.deploy(
                "USDT",
                "USDT",
                USDT_DECIMALS,
                BigInt(1_000_000_000) * BigInt(10) ** BigInt(USDT_DECIMALS)
            );
            await usdt.waitForDeployment?.();

            // Deploy GREENToken as the presale token
            const GREENTokenFactory = await ethers.getContractFactory(
                "GREENToken"
            );
            greenToken = await GREENTokenFactory.deploy(
                owner.address,
                MAX_SALE_AMOUNT
            );
            await greenToken.waitForDeployment?.();

            // Set presale timing
            const startTime = (await time.latest()) + 3600; // start in 1 hour
            const endTime = startTime + 86400; // end in 24h

            const isWhitelistEnabled = false;
            const PresaleFactory = await ethers.getContractFactory(
                "GREENPresale"
            );
            presale = await PresaleFactory.deploy(
                await usdt.getAddress(),
                await greenToken.getAddress(),
                revenueReceiver.address,
                TOKEN_PRICE,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                isWhitelistEnabled,
                MAX_USDT_SPENDING_PER_USER
            );
            await presale.waitForDeployment?.();

            // Transfer presale tokens to presale contract
            await greenToken.transfer(
                await presale.getAddress(),
                MAX_SALE_AMOUNT
            );

            // Fund buyers with USDT
            const usdtAmount = ethers.parseEther("2000000");
            await usdt.transfer(buyer1.address, usdtAmount);
            await usdt.transfer(buyer2.address, usdtAmount);
        });

        it("deploys with correct initial state", async function () {
            expect(await presale.usdtToken()).to.equal(await usdt.getAddress());
            expect(await presale.greenPresaleToken()).to.equal(
                await greenToken.getAddress()
            );
            expect(await presale.revenueReceiver()).to.equal(
                revenueReceiver.address
            );
            expect(await presale.tokenPrice()).to.equal(TOKEN_PRICE);
            expect(await presale.maxSaleAmount()).to.equal(MAX_SALE_AMOUNT);
            expect(await presale.minPurchaseAmount()).to.equal(MIN_PURCHASE);
            expect(await presale.isWhitelistEnabled()).to.equal(false);
        });

        describe("Whitelist Management and Purchases", function () {
            const usdtLimit = ethers.parseEther("5000");

            it("Should add single address to whitelist with USDT limit", async function () {
                await expect(presale.addToWhitelist(buyer1.address, usdtLimit))
                    .to.emit(presale, "AddressWhitelisted")
                    .withArgs(buyer1.address, usdtLimit);

                expect(await presale.isWhitelisted(buyer1.address)).to.be.true;
                expect(
                    await presale.whitelistUSDTMaxAmount(buyer1.address)
                ).to.equal(usdtLimit);
            });

            it("Should handle batch whitelist add and remove", async function () {
                const addresses = [buyer1.address, buyer2.address];
                const limits = [
                    ethers.parseEther("5000"),
                    ethers.parseEther("3000"),
                ];

                await presale.batchAddToWhitelist(addresses, limits);
                for (let i = 0; i < addresses.length; i++) {
                    expect(await presale.isWhitelisted(addresses[i])).to.be
                        .true;
                    expect(
                        await presale.whitelistUSDTMaxAmount(addresses[i])
                    ).to.equal(limits[i]);
                }

                await presale.batchRemoveFromWhitelist(addresses);
                for (const addr of addresses) {
                    expect(await presale.isWhitelisted(addr)).to.be.false;
                    expect(await presale.whitelistUSDTMaxAmount(addr)).to.equal(
                        0
                    );
                }
            });

            it("Should update whitelist USDT limits correctly", async function () {
                await presale.addToWhitelist(buyer1.address, usdtLimit);
                const newLimit = ethers.parseEther("7000");
                await presale.updateWhitelistMaxAmount(
                    buyer1.address,
                    newLimit
                );
                expect(
                    await presale.whitelistUSDTMaxAmount(buyer1.address)
                ).to.equal(newLimit);
            });

            it("Should enforce whitelist when enabled: must be whitelisted and within limit", async function () {
                await time.increase(3600);
                // enable whitelist
                await presale.setWhitelistStatus(true);

                // without being whitelisted, purchase should fail
                await usdt
                    .connect(buyer1)
                    .approve(await presale.getAddress(), usdtLimit);
                await expect(
                    presale.connect(buyer1).buyTokens(usdtLimit)
                ).to.be.revertedWith("Address not whitelisted");

                // add to whitelist and purchase within limit
                await presale.addToWhitelist(buyer1.address, usdtLimit);
                await expect(
                    presale.connect(buyer1).buyTokens(ethers.parseEther("1000"))
                ).to.not.be.reverted;

                // attempt to exceed spending limit
                const over = ethers.parseEther("6000");
                await usdt
                    .connect(buyer1)
                    .approve(await presale.getAddress(), over);
                await expect(
                    presale.connect(buyer1).buyTokens(over)
                ).to.be.revertedWith(
                    "Exceeds total allowed USDT spending amount"
                );
            });

            it("Should allow multiple purchases while accumulating USDT spent", async function () {
                await time.increase(3600);
                await presale.setWhitelistStatus(true);
                await presale.addToWhitelist(buyer1.address, usdtLimit);

                const a = ethers.parseEther("2000");
                const b = ethers.parseEther("1000");
                await usdt
                    .connect(buyer1)
                    .approve(await presale.getAddress(), a + b);
                await presale.connect(buyer1).buyTokens(a);
                await presale.connect(buyer1).buyTokens(b);
                expect(
                    await presale.userTotalUSDTSpent(buyer1.address)
                ).to.equal(a + b);
            });
        });

        describe("Presale controls and misc", function () {
            it("toggles whitelist status", async function () {
                await presale.setWhitelistStatus(true);
                expect(await presale.isWhitelistEnabled()).to.be.true;
                await presale.setWhitelistStatus(false);
                expect(await presale.isWhitelistEnabled()).to.be.false;
            });

            it("Should handle presale configuration updates", async function () {
                const newPrice = ethers.parseEther("0.12");
                const newStart = (await time.latest()) + 7200;
                const newEnd = newStart + 86400;
                const newMax = ethers.parseEther("20000000");
                await presale.updatePresaleConfig(
                    newPrice,
                    newStart,
                    newEnd,
                    newMax,
                    true
                );
                expect(await presale.tokenPrice()).to.equal(newPrice);
                expect(await presale.startTime()).to.equal(newStart);
                expect(await presale.endTime()).to.equal(newEnd);
                expect(await presale.maxSaleAmount()).to.equal(newMax);
                expect(await presale.isWhitelistEnabled()).to.be.true;
            });

            it("Should handle emergency premature withdrawal when paused", async function () {
                await presale.pause();
                const withdrawAmount = ethers.parseEther("1000");
                // transfer some tokens to contract first if needed
                await expect(
                    presale.prematureWithdrawPresaleTokens(withdrawAmount)
                ).to.emit(presale, "PrematureTokenWithdrawal");
            });

            it("enforces minPurchaseAmount based on token amount (not USDT)", async function () {
                // Choose a min in token units
                const newMinTokens = ethers.parseEther("500"); // 500 tokens
                await presale.setMinPurchaseAmount(newMinTokens);

                // Compute required USDT to buy exactly newMinTokens: usdt = newMinTokens * tokenPrice / 1e18
                const requiredUSDT =
                    (BigInt(newMinTokens) *
                        BigInt(await presale.tokenPrice())) /
                    BigInt(ethers.parseEther("1"));
                // Attempt with slightly less than requiredUSDT should revert
                const below = requiredUSDT - BigInt(1);
                // fast-forward to presale start so purchases are allowed
                await time.increase(3600);
                await usdt
                    .connect(buyer1)
                    .approve(await presale.getAddress(), below);
                await expect(
                    presale.connect(buyer1).buyTokens(below)
                ).to.be.revertedWith("Below minimum purchase amount");
            });

            it("Should allow owner to set a new revenueReceiver", async function () {
                await presale.setRevenueReceiver(buyer2.address);
                expect(await presale.revenueReceiver()).to.equal(
                    buyer2.address
                );
            });

            it("Should update maxSaleAmount and get presale status", async function () {
                const dec = ethers.parseEther("500000");
                const newMax = (await presale.maxSaleAmount()) - dec;
                await presale.setMaxSaleAmount(newMax);
                expect(await presale.maxSaleAmount()).to.equal(newMax);

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
                // Fast forward to after end
                const endTime = await presale.endTime();
                const current = await time.latest();
                const wait = Number(endTime) - Number(current) + 1;
                await time.increase(wait);

                const contractBalance = await greenToken.balanceOf(
                    await presale.getAddress()
                );
                await expect(presale.withdrawUnsoldPresaleTokens()).to.emit(
                    presale,
                    "PresaleTokensWithdrawn"
                );
            });
        });
    });

    context("With 6 Decimal USDT Token", function () {
        const USDT_DECIMALS = 6;
        const TOKEN_PRICE = ethers.parseUnits("0.06", USDT_DECIMALS); // price in USDT's smallest unit
        const MIN_PURCHASE = ethers.parseUnits("0.1", USDT_DECIMALS);
        const MAX_SALE_AMOUNT = ethers.parseEther("12500000");
        const MAX_USDT_SPENDING_PER_USER = ethers.parseUnits(
            "1000000",
            USDT_DECIMALS
        );

        beforeEach(async function () {
            [owner, buyer1, buyer2, revenueReceiver] =
                await ethers.getSigners();

            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt = await TokenFactory.deploy(
                "USDT",
                "USDT",
                USDT_DECIMALS,
                BigInt(1_000_000_000) * BigInt(10) ** BigInt(USDT_DECIMALS)
            );
            await usdt.waitForDeployment?.();

            const GREENTokenFactory = await ethers.getContractFactory(
                "GREENToken"
            );
            greenToken = await GREENTokenFactory.deploy(
                owner.address,
                MAX_SALE_AMOUNT
            );
            await greenToken.waitForDeployment?.();

            const startTime = (await time.latest()) + 3600;
            const endTime = startTime + 86400;

            const isWhitelistEnabled = false;
            const PresaleFactory = await ethers.getContractFactory(
                "GREENPresale"
            );
            presale = await PresaleFactory.deploy(
                await usdt.getAddress(),
                await greenToken.getAddress(),
                revenueReceiver.address,
                TOKEN_PRICE,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                isWhitelistEnabled,
                MAX_USDT_SPENDING_PER_USER
            );
            await presale.waitForDeployment?.();

            await greenToken.transfer(
                await presale.getAddress(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseUnits("2000000", USDT_DECIMALS);
            await usdt.transfer(buyer1.address, usdtAmount);
            await usdt.transfer(buyer2.address, usdtAmount);

            await time.increase(3600);
            await presale.setWhitelistStatus(true);
            await presale.addToWhitelist(
                buyer1.address,
                ethers.parseUnits("5000", USDT_DECIMALS)
            );
        });

        it("handles 6-decimal USDT purchases and conversion correctly", async function () {
            const purchase = BigInt(1000) * BigInt(10) ** BigInt(USDT_DECIMALS); // 1000 USDT
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), purchase);
            await presale.connect(buyer1).buyTokens(purchase);

            const expectedTokens =
                (purchase * BigInt(10) ** BigInt(18)) / TOKEN_PRICE;
            const events = await presale.queryFilter(
                presale.filters.TokensPurchased(buyer1.address)
            );
            expect(events[0].args.amount).to.equal(expectedTokens);

            expect(await presale.userTotalUSDTSpent(buyer1.address)).to.equal(
                purchase
            );
        });

        it("enforces 6-decimal spending limits correctly", async function () {
            const limit = BigInt(5000) * BigInt(10) ** BigInt(USDT_DECIMALS);
            await presale.updateWhitelistMaxAmount(buyer1.address, limit);

            const over = limit + BigInt(10) ** BigInt(USDT_DECIMALS);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), over);
            await expect(
                presale.connect(buyer1).buyTokens(over)
            ).to.be.revertedWith("Exceeds total allowed USDT spending amount");
        });

        it("accumulates 6-decimal spending correctly", async function () {
            const a = BigInt(2000) * BigInt(10) ** BigInt(USDT_DECIMALS);
            const b = BigInt(1500) * BigInt(10) ** BigInt(USDT_DECIMALS);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), a + b);
            await presale.connect(buyer1).buyTokens(a);
            await presale.connect(buyer1).buyTokens(b);
            expect(await presale.userTotalUSDTSpent(buyer1.address)).to.equal(
                a + b
            );
        });
    });
});
