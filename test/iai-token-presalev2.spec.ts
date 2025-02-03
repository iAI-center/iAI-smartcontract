import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { IAIPresaleV2, IERC20 } from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("IAIPresaleV2", function () {
    let presale: IAIPresaleV2;
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
        const isWhitelistEnabled = false;
        const PresaleFactory = await ethers.getContractFactory("IAIPresaleV2");
        presale = await PresaleFactory.deploy(
            await usdt.getAddress(),
            await iaiPresaleToken.getAddress(),
            revenueReceiver.address,
            TOKEN_PRICE,
            startTime,
            endTime,
            MAX_SALE_AMOUNT,
            MIN_PURCHASE,
            isWhitelistEnabled
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
        // ...existing deployment test cases...
    });

    describe("Whitelist Management", function () {
        it("Should allow owner to add address to whitelist", async function () {
            const maxAmount = ethers.parseEther("5000");
            await expect(presale.addToWhitelist(buyer1.address, maxAmount))
                .to.emit(presale, "AddressWhitelisted")
                .withArgs(buyer1.address, maxAmount);

            expect(await presale.isWhitelisted(buyer1.address)).to.be.true;
            expect(await presale.whitelistMaxAmount(buyer1.address)).to.equal(
                maxAmount
            );
        });

        it("Should allow owner to remove address from whitelist", async function () {
            await presale.addToWhitelist(buyer1.address, MAX_PURCHASE);
            await expect(presale.removeFromWhitelist(buyer1.address))
                .to.emit(presale, "AddressRemovedFromWhitelist")
                .withArgs(buyer1.address);

            expect(await presale.isWhitelisted(buyer1.address)).to.be.false;
        });

        it("Should allow batch addition to whitelist", async function () {
            const addresses = [buyer1.address, buyer2.address];
            const maxAmounts = [
                ethers.parseEther("5000"),
                ethers.parseEther("3000"),
            ];

            await expect(presale.batchAddToWhitelist(addresses, maxAmounts))
                .to.emit(presale, "BatchWhitelistAdded")
                .withArgs(addresses, maxAmounts);

            expect(await presale.isWhitelisted(buyer1.address)).to.be.true;
            expect(await presale.isWhitelisted(buyer2.address)).to.be.true;
        });

        it("Should allow updating whitelist max amounts", async function () {
            await presale.addToWhitelist(buyer1.address, MAX_PURCHASE);
            const newMaxAmount = ethers.parseEther("7500");

            await expect(
                presale.updateWhitelistMaxAmount(buyer1.address, newMaxAmount)
            )
                .to.emit(presale, "AddressWhitelisted")
                .withArgs(buyer1.address, newMaxAmount);

            expect(await presale.whitelistMaxAmount(buyer1.address)).to.equal(
                newMaxAmount
            );
        });

        it("Should return correct whitelisted addresses with pagination", async function () {
            const addresses = [buyer1.address, buyer2.address];
            const maxAmounts = [
                ethers.parseEther("5000"),
                ethers.parseEther("3000"),
            ];

            await presale.batchAddToWhitelist(addresses, maxAmounts);

            const [returnedAddresses, returnedMaxAmounts, total] =
                await presale.getWhitelistedAddresses(0, 10);

            expect(total).to.equal(2);
            expect(returnedAddresses).to.deep.equal(addresses);
            expect(returnedMaxAmounts).to.deep.equal(maxAmounts);
        });
    });

    describe("Token Purchase with Whitelist", function () {
        beforeEach(async function () {
            await time.increase(3600); // Move past start time
            await presale.addToWhitelist(
                buyer1.address,
                ethers.parseEther("5000")
            );
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), ethers.parseEther("5000"));
        });

        it("Should allow whitelisted address to purchase tokens", async function () {
            const purchaseAmount = ethers.parseEther("1000");
            await expect(presale.connect(buyer1).buyTokens(purchaseAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, purchaseAmount, purchaseAmount);
        });

        it("Should prevent non-whitelisted address from purchasing", async function () {
            const purchaseAmount = ethers.parseEther("1000");
            await usdt
                .connect(buyer2)
                .approve(await presale.getAddress(), purchaseAmount);
            await expect(
                presale.connect(buyer2).buyTokens(purchaseAmount)
            ).to.be.revertedWith("Address not whitelisted");
        });

        it("Should enforce individual whitelist max amount", async function () {
            const maxAmount = ethers.parseEther("5000");
            const exceedAmount = ethers.parseEther("5001");

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), exceedAmount);
            await expect(
                presale.connect(buyer1).buyTokens(exceedAmount)
            ).to.be.revertedWith("Exceeds total allowed purchase amount");
        });
    });

    // ... Include other relevant test cases from original file ...
});
