import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IAIPresale, IERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IAIPresale", function () {
    let presale: IAIPresale;
    let usdt: IERC20;
    let iaiPresaleToken: IERC20;
    let owner: SignerWithAddress;
    let buyer1: SignerWithAddress;
    let buyer2: SignerWithAddress;
    let revenueReceiver: SignerWithAddress;

    const TOKEN_PRICE = ethers.parseEther("1"); // 1 USDT per token
    const MIN_PURCHASE = ethers.parseEther("100"); // 100 tokens
    const MAX_PURCHASE = ethers.parseEther("10000"); // 10000 tokens
    const MAX_SALE_AMOUNT = ethers.parseEther("1000000"); // 1M tokens

    beforeEach(async function () {
        [owner, buyer1, buyer2, revenueReceiver] = await ethers.getSigners();

        // Deploy mock USDT and IAI tokens
        const TokenFactory = await ethers.getContractFactory("MockERC20");
        usdt = (await (
            await TokenFactory.deploy(
                "USDT",
                "USDT",
                18,
                ethers.parseEther("1000000000")
            )
        ).waitForDeployment()) as IERC20;
        iaiPresaleToken = (await (
            await TokenFactory.deploy(
                "IAI Token",
                "IAI",
                18,
                ethers.parseEther("12500000")
            )
        ).waitForDeployment()) as IERC20;

        // Set up presale timing
        const startTime = (await time.latest()) + 3600; // Start in 1 hour
        const endTime = startTime + 86400; // End in 24 hours

        // Deploy presale contract
        const PresaleFactory = await ethers.getContractFactory("IAIPresale");
        presale = await PresaleFactory.deploy(
            await usdt.getAddress(),
            await iaiPresaleToken.getAddress(),
            revenueReceiver.address,
            TOKEN_PRICE,
            startTime,
            endTime,
            MAX_SALE_AMOUNT,
            MIN_PURCHASE,
            MAX_PURCHASE
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
        it("Should set the correct initial values", async function () {
            expect(await presale.usdtToken()).to.equal(await usdt.getAddress());
            expect(await presale.iaiPresaleToken()).to.equal(
                await iaiPresaleToken.getAddress()
            );
            expect(await presale.revenueReceiver()).to.equal(
                revenueReceiver.address
            );
            expect(await presale.tokenPrice()).to.equal(TOKEN_PRICE);
            expect(await presale.maxSaleAmount()).to.equal(MAX_SALE_AMOUNT);
            expect(await presale.minPurchaseAmount()).to.equal(MIN_PURCHASE);
            expect(await presale.maxPurchaseAmount()).to.equal(MAX_PURCHASE);
        });
    });

    describe("Token Purchase", function () {
        beforeEach(async function () {
            await time.increase(3600); // Move past start time
            await usdt
                .connect(buyer1)
                .approve(
                    await presale.getAddress(),
                    ethers.parseEther("10000")
                );
        });

        it("Should process purchase and send USDT to revenue receiver", async function () {
            const purchaseAmount = ethers.parseEther("1000");
            const initialReceiverBalance = await usdt.balanceOf(
                revenueReceiver.address
            );

            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, purchaseAmount);

            const finalReceiverBalance = await usdt.balanceOf(
                revenueReceiver.address
            );
            expect(finalReceiverBalance - initialReceiverBalance).to.equal(
                purchaseAmount
            );
        });

        it("Should reject purchases below minimum amount", async function () {
            const smallAmount = ethers.parseEther("50");
            await expect(
                presale.connect(buyer1).buyTokens(smallAmount)
            ).to.be.revertedWith("Below minimum purchase amount");
        });

        it("Should reject purchases above maximum amount", async function () {
            const largeAmount = ethers.parseEther("20000");
            await expect(
                presale.connect(buyer1).buyTokens(largeAmount)
            ).to.be.revertedWith("Exceeds maximum purchase amount");
        });

        it("Should allow any user to purchase when whitelist is disabled", async function () {
            // Update presale config to disable whitelist
            const currentTime = await time.latest();
            await presale.updatePresaleConfig(
                TOKEN_PRICE,
                currentTime + 10,
                currentTime + 86400,
                MAX_SALE_AMOUNT
            );

            await time.increase(20); // Move past new start time

            // Try purchase with non-whitelisted buyer2
            await usdt
                .connect(buyer2)
                .approve(await presale.getAddress(), ethers.parseEther("1000"));

            const purchaseAmount = ethers.parseEther("1000");
            await expect(presale.connect(buyer2).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer2.address, purchaseAmount, purchaseAmount);

            expect(await presale.userTotalPurchased(buyer2.address)).to.equal(
                purchaseAmount
            );
        });
    });

    describe("Price Variations", function () {
        beforeEach(async function () {
            await time.increase(3600);
        });

        it("Should calculate correct cost for default price (1 USDT)", async function () {
            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = purchaseAmount; // 1:1 ratio

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });

        it("Should calculate correct cost for fractional price (0.5 USDT)", async function () {
            const newPrice = ethers.parseEther("0.5"); // 0.5 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = ethers.parseEther("500"); // 500 USDT

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });

        it("Should calculate correct cost for premium price (2.5 USDT)", async function () {
            const newPrice = ethers.parseEther("2.5"); // 2.5 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = ethers.parseEther("2500"); // 2500 USDT

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });

        it("Should fail when user has insufficient USDT for higher price", async function () {
            const newPrice = ethers.parseEther("100000"); // 10 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("5000"); // 5000 tokens = 50000 USDT needed
            await usdt
                .connect(buyer1)
                .approve(
                    await presale.getAddress(),
                    ethers.parseEther("50000")
                );

            await expect(
                presale.connect(buyer1).buyTokens(purchaseAmount)
            ).to.be.revertedWith("Insufficient USDT balance");
        });

        it("Should deduct correct USDT amount for default price", async function () {
            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = purchaseAmount; // 1:1 ratio

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await presale.connect(buyer1).buyTokens(purchaseAmount);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                expectedCost
            );
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                expectedCost
            );
        });

        it("Should deduct correct USDT amount for fractional price", async function () {
            const newPrice = ethers.parseEther("0.5"); // 0.5 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = ethers.parseEther("500"); // 500 USDT

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await presale.connect(buyer1).buyTokens(purchaseAmount);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                expectedCost
            );
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                expectedCost
            );
        });

        it("Should deduct correct USDT amount for multiple purchases", async function () {
            const newPrice = ethers.parseEther("2"); // 2 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount1 = ethers.parseEther("500"); // 500 tokens
            const purchaseAmount2 = ethers.parseEther("300"); // 300 tokens
            const expectedCost1 = ethers.parseEther("1000"); // 1000 USDT
            const expectedCost2 = ethers.parseEther("600"); // 600 USDT

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);

            // First purchase
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost1);
            await presale.connect(buyer1).buyTokens(purchaseAmount1);

            // Second purchase
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost2);
            await presale.connect(buyer1).buyTokens(purchaseAmount2);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                expectedCost1 + expectedCost2
            );
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                expectedCost1 + expectedCost2
            );
        });

        it("Should handle very small fractional prices (0.0001 USDT)", async function () {
            const newPrice = ethers.parseEther("0.0001"); // 0.0001 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("1000"); // 1000 tokens
            const expectedCost = ethers.parseEther("0.1"); // 0.1 USDT

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });

        it("Should handle large token prices (1000 USDT)", async function () {
            const newPrice = ethers.parseEther("1000"); // 1000 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("100"); // 10 tokens
            const expectedCost = ethers.parseEther("100000"); // 10000 USDT

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });

        it("Should handle price updates between purchases", async function () {
            // First purchase at 1 USDT
            const purchaseAmount = ethers.parseEther("100");
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), purchaseAmount);
            await presale.connect(buyer1).buyTokens(purchaseAmount);

            // Update price to 2 USDT
            const newPrice = ethers.parseEther("2");
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            // Second purchase at new price
            const secondPurchaseAmount = ethers.parseEther("100");
            const expectedCost = ethers.parseEther("200"); // 100 tokens * 2 USDT
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(
                presale.connect(buyer1).buyTokens(secondPurchaseAmount)
            )
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, secondPurchaseAmount, expectedCost);
        });

        it("Should handle price with many decimal places (1.234567 USDT)", async function () {
            const newPrice = ethers.parseEther("1.234567");
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const purchaseAmount = ethers.parseEther("100");
            const expectedCost = ethers.parseEther("123.4567");

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), expectedCost);
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, expectedCost);
        });
    });

    describe("Presale Configuration", function () {
        it("Should allow owner to update presale config", async function () {
            const newPrice = ethers.parseEther("2");
            const newStartTime = (await time.latest()) + 7200;
            const newEndTime = newStartTime + 86400;

            await presale.updatePresaleConfig(
                newPrice,
                newStartTime,
                newEndTime,
                MAX_SALE_AMOUNT
            );

            expect(await presale.tokenPrice()).to.equal(newPrice);
            expect(await presale.startTime()).to.equal(newStartTime);
            expect(await presale.endTime()).to.equal(newEndTime);
        });
    });

    describe("Emergency Controls", function () {
        it("Should allow owner to pause and unpause", async function () {
            await presale.pause();
            expect(await presale.paused()).to.be.true;

            await presale.unpause();
            expect(await presale.paused()).to.be.false;
        });

        it("Should not allow purchases when paused", async function () {
            await time.increase(3600);
            await presale.pause();

            await expect(
                presale.connect(buyer1).buyTokens(MIN_PURCHASE)
            ).to.be.revertedWithCustomError(presale, "EnforcedPause");
        });
    });

    describe("Revenue Receiver Management", function () {
        it("Should allow owner to update revenue receiver", async function () {
            const newReceiver = buyer2.address;
            await expect(presale.setRevenueReceiver(newReceiver))
                .to.emit(presale, "RevenueReceiverUpdated")
                .withArgs(newReceiver);
            expect(await presale.revenueReceiver()).to.equal(newReceiver);
        });

        it("Should not allow setting zero address as revenue receiver", async function () {
            await expect(
                presale.setRevenueReceiver(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("Should not allow non-owner to update revenue receiver", async function () {
            await expect(
                presale.connect(buyer1).setRevenueReceiver(buyer2.address)
            ).to.be.revertedWithCustomError(
                presale,
                "OwnableUnauthorizedAccount"
            );
        });
    });

    describe("Withdrawals", function () {
        it("Should allow owner to withdraw unsold tokens after presale", async function () {
            await time.increase(90000); // Move past end time
            const initialBalance = await iaiPresaleToken.balanceOf(
                owner.address
            );
            await presale.withdrawUnsoldPresaleTokens();
            const finalBalance = await iaiPresaleToken.balanceOf(owner.address);

            expect(finalBalance).to.be.gt(initialBalance);
        });
    });
});
