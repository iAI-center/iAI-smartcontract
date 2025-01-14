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
            const usdtAmount = ethers.parseEther("1000"); // 1000 USDT
            const expectedTokens = usdtAmount; // 1:1 ratio at TOKEN_PRICE = 1

            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);

            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                usdtAmount
            );
        });

        it("Should reject purchases below minimum amount", async function () {
            const smallAmount = ethers.parseEther("50"); // 50 USDT
            await expect(
                presale.connect(buyer1).buyTokens(smallAmount)
            ).to.be.revertedWith("Below minimum purchase amount");
        });

        it("Should reject purchases above maximum amount", async function () {
            const largeAmount = ethers.parseEther("20000"); // 20000 USDT
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

            const usdtAmount = ethers.parseEther("1000"); // 1000 USDT
            const expectedTokens = usdtAmount; // 1:1 ratio at TOKEN_PRICE = 1

            await expect(presale.connect(buyer2).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer2.address, expectedTokens, usdtAmount);

            expect(await presale.userTotalPurchased(buyer2.address)).to.equal(
                expectedTokens
            );
        });
    });

    describe("Price Variations", function () {
        beforeEach(async function () {
            await time.increase(3600);
        });

        it("Should calculate correct tokens for default price (1 USDT)", async function () {
            const usdtAmount = ethers.parseEther("1000"); // 1000 USDT
            const expectedTokens = usdtAmount; // 1:1 ratio

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
        });

        it("Should calculate correct tokens for fractional price (0.5 USDT)", async function () {
            const newPrice = ethers.parseEther("0.5"); // 0.5 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseEther("500"); // 500 USDT
            const expectedTokens = ethers.parseEther("1000"); // 1000 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
        });

        it("Should calculate correct cost for premium price (2.5 USDT)", async function () {
            const newPrice = ethers.parseEther("2.5"); // 2.5 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseEther("2500"); // 2500 USDT
            const expectedTokens = ethers.parseEther("1000"); // 1000 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
        });

        it("Should fail when user has insufficient USDT for higher price", async function () {
            const newPrice = ethers.parseEther("100000000"); // 100M USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseEther("500000000000"); // 500B USDT
            const expectedTokens = ethers.parseEther("5000"); // 5000 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);

            await expect(
                presale.connect(buyer1).buyTokens(usdtAmount)
            ).to.be.revertedWith("Insufficient USDT balance");
        });

        it("Should deduct correct USDT amount for default price", async function () {
            const usdtAmount = ethers.parseEther("1000"); // 1000 USDT
            const expectedTokens = usdtAmount; // 1:1 ratio

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await presale.connect(buyer1).buyTokens(usdtAmount);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(usdtAmount);
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                usdtAmount
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

            const usdtAmount = ethers.parseEther("500"); // 500 USDT
            const expectedTokens = ethers.parseEther("1000"); // 1000 tokens

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await presale.connect(buyer1).buyTokens(usdtAmount);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(usdtAmount);
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                usdtAmount
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

            const usdtAmount1 = ethers.parseEther("1000"); // 1000 USDT
            const usdtAmount2 = ethers.parseEther("600"); // 600 USDT
            const expectedTokens1 = ethers.parseEther("500"); // 500 tokens
            const expectedTokens2 = ethers.parseEther("300"); // 300 tokens

            const initialUSDTBalance = await usdt.balanceOf(buyer1.address);

            // First purchase
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount1);
            await presale.connect(buyer1).buyTokens(usdtAmount1);

            // Second purchase
            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount2);
            await presale.connect(buyer1).buyTokens(usdtAmount2);

            const finalUSDTBalance = await usdt.balanceOf(buyer1.address);
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                usdtAmount1 + usdtAmount2
            );
            expect(await usdt.balanceOf(revenueReceiver.address)).to.equal(
                usdtAmount1 + usdtAmount2
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

            const usdtAmount = ethers.parseEther("0.1"); // 0.1 USDT
            const expectedTokens = ethers.parseEther("1000"); // 1000 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
        });

        it("Should handle large token prices (1000 USDT)", async function () {
            const newPrice = ethers.parseEther("1000"); // 1000 USDT per token
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseEther("100000"); // 100000 USDT
            const expectedTokens = ethers.parseEther("100"); // 100 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
        });

        it("Should handle price updates between purchases", async function () {
            // First purchase at 1 USDT
            const usdtAmount1 = ethers.parseEther("100"); // 100 USDT
            const expectedTokens1 = usdtAmount1; // 1:1 ratio

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount1);
            await presale.connect(buyer1).buyTokens(usdtAmount1);

            // Update price to 2 USDT
            const newPrice = ethers.parseEther("2");
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            // Second purchase at new price
            const usdtAmount2 = ethers.parseEther("200"); // 200 USDT
            const expectedTokens2 = ethers.parseEther("100"); // 100 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount2);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount2))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens2, usdtAmount2);
        });

        it("Should handle price with many decimal places (1.234567 USDT)", async function () {
            const newPrice = ethers.parseEther("1.234567");
            await presale.updatePresaleConfig(
                newPrice,
                await presale.startTime(),
                await presale.endTime(),
                MAX_SALE_AMOUNT
            );

            const usdtAmount = ethers.parseEther("123.4567"); // 123.4567 USDT
            const expectedTokens = ethers.parseEther("100"); // 100 tokens

            await usdt
                .connect(buyer1)
                .approve(await presale.getAddress(), usdtAmount);
            await expect(presale.connect(buyer1).buyTokens(usdtAmount))
                .to.emit(presale, "TokensPurchased")
                .withArgs(buyer1.address, expectedTokens, usdtAmount);
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

    describe("USDT (6 Decimals) Price Scenarios", function () {
        let usdt6Decimals: IERC20;
        let presaleWith6DecimalUSDT: IAIPresale;
        const PRICE_6DEC = BigInt("600000"); // 0.6 USDT (6 decimals)

        beforeEach(async function () {
            // Deploy USDT with 6 decimals
            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt6Decimals = (await (
                await TokenFactory.deploy(
                    "USDT",
                    "USDT",
                    6,
                    BigInt("2000000000000") // 1M USDT with 6 decimals
                )
            ).waitForDeployment()) as IERC20;

            // Set up presale timing
            const startTime = (await time.latest()) + 3600;
            const endTime = startTime + 86400;

            // Deploy presale contract with 6 decimal USDT
            const PresaleFactory = await ethers.getContractFactory(
                "IAIPresale"
            );
            presaleWith6DecimalUSDT = await PresaleFactory.deploy(
                await usdt6Decimals.getAddress(),
                await iaiPresaleToken.getAddress(),
                revenueReceiver.address,
                PRICE_6DEC,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                MAX_PURCHASE
            );

            // Fund the presale contract with IAI tokens
            await iaiPresaleToken.transfer(
                await presaleWith6DecimalUSDT.getAddress(),
                MAX_SALE_AMOUNT
            );

            // Fund buyers with USDT (6 decimals)
            const usdtAmount = BigInt("1000000000000"); // 1M USDT
            await usdt6Decimals.transfer(buyer1.address, usdtAmount);
            await usdt6Decimals.transfer(buyer2.address, usdtAmount);

            // Move to presale start time
            await time.increase(3600);
        });

        it("Should calculate correct costs for various purchase amounts with 0.6 USDT price", async function () {
            const testCases = [
                {
                    tokens: ethers.parseEther("100"), // 100 IAI tokens
                    expectedCost: BigInt("60000000"), // 60 USDT (6 decimals)
                },
                {
                    tokens: ethers.parseEther("1000"), // 1000 IAI tokens
                    expectedCost: BigInt("600000000"), // 600 USDT (6 decimals)
                },
                {
                    tokens: ethers.parseEther("5000"), // 5000 IAI tokens
                    expectedCost: BigInt("3000000000"), // 3000 USDT (6 decimals)
                },
            ];

            for (const testCase of testCases) {
                // Approve USDT spending
                await usdt6Decimals
                    .connect(buyer1)
                    .approve(
                        await presaleWith6DecimalUSDT.getAddress(),
                        testCase.expectedCost
                    );

                // Verify the purchase
                await expect(
                    presaleWith6DecimalUSDT
                        .connect(buyer1)
                        .buyTokens(testCase.tokens)
                )
                    .to.emit(presaleWith6DecimalUSDT, "TokensPurchased")
                    .withArgs(
                        buyer1.address,
                        testCase.tokens,
                        testCase.expectedCost
                    );

                // Verify balances
                const receiverBalance = await usdt6Decimals.balanceOf(
                    revenueReceiver.address
                );
                expect(receiverBalance).to.equal(testCase.expectedCost);

                // Reset revenue receiver balance for next test
                await usdt6Decimals
                    .connect(revenueReceiver)
                    .transfer(owner.address, receiverBalance);
            }
        });

        it("Should handle fractional token amounts with 6 decimal USDT", async function () {
            const tokens = ethers.parseEther("150.5"); // 150.5 IAI tokens
            const expectedCost = BigInt("90300000"); // 90.3 USDT (6 decimals)

            // Get initial balances
            const initialUSDTBalance = await usdt6Decimals.balanceOf(
                buyer1.address
            );
            const initialTokenBalance = await iaiPresaleToken.balanceOf(
                buyer1.address
            );
            const initialReceiverBalance = await usdt6Decimals.balanceOf(
                revenueReceiver.address
            );

            await usdt6Decimals
                .connect(buyer1)
                .approve(
                    await presaleWith6DecimalUSDT.getAddress(),
                    expectedCost
                );

            await expect(
                presaleWith6DecimalUSDT.connect(buyer1).buyTokens(tokens)
            )
                .to.emit(presaleWith6DecimalUSDT, "TokensPurchased")
                .withArgs(buyer1.address, tokens, expectedCost);

            // Verify final balances
            const finalUSDTBalance = await usdt6Decimals.balanceOf(
                buyer1.address
            );
            const finalTokenBalance = await iaiPresaleToken.balanceOf(
                buyer1.address
            );
            const finalReceiverBalance = await usdt6Decimals.balanceOf(
                revenueReceiver.address
            );

            // Verify USDT deduction
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                expectedCost
            );

            // Verify IAI token received
            expect(finalTokenBalance - initialTokenBalance).to.equal(tokens);

            // Verify revenue receiver got correct USDT amount
            expect(finalReceiverBalance - initialReceiverBalance).to.equal(
                expectedCost
            );
        });
    });

    describe("USDT (18 Decimals) Price Scenarios", function () {
        let usdt18Decimals: IERC20;
        let presaleWith18DecimalUSDT: IAIPresale;
        const PRICE_18DEC = ethers.parseEther("0.6"); // 0.6 USDT (18 decimals)

        beforeEach(async function () {
            // Deploy USDT with 18 decimals
            const TokenFactory = await ethers.getContractFactory("MockERC20");
            usdt18Decimals = (await (
                await TokenFactory.deploy(
                    "USDT",
                    "USDT",
                    18,
                    ethers.parseEther("2000000") // 2M USDT with 18 decimals
                )
            ).waitForDeployment()) as IERC20;

            // Set up presale timing
            const startTime = (await time.latest()) + 3600;
            const endTime = startTime + 86400;

            // Deploy presale contract with 18 decimal USDT
            const PresaleFactory = await ethers.getContractFactory(
                "IAIPresale"
            );
            presaleWith18DecimalUSDT = await PresaleFactory.deploy(
                await usdt18Decimals.getAddress(),
                await iaiPresaleToken.getAddress(),
                revenueReceiver.address,
                PRICE_18DEC,
                startTime,
                endTime,
                MAX_SALE_AMOUNT,
                MIN_PURCHASE,
                MAX_PURCHASE
            );

            // Fund the presale contract with IAI tokens
            await iaiPresaleToken.transfer(
                await presaleWith18DecimalUSDT.getAddress(),
                MAX_SALE_AMOUNT
            );

            // Fund buyers with USDT (18 decimals)
            const usdtAmount = ethers.parseEther("1000000"); // 1M USDT
            await usdt18Decimals.transfer(buyer1.address, usdtAmount);
            await usdt18Decimals.transfer(buyer2.address, usdtAmount);

            // Move to presale start time
            await time.increase(3600);
        });

        it("Should calculate correct costs for various purchase amounts with 0.6 USDT price", async function () {
            const testCases = [
                {
                    tokens: ethers.parseEther("100"), // 100 IAI tokens
                    expectedCost: ethers.parseEther("60"), // 60 USDT (18 decimals)
                },
                {
                    tokens: ethers.parseEther("1000"), // 1000 IAI tokens
                    expectedCost: ethers.parseEther("600"), // 600 USDT (18 decimals)
                },
                {
                    tokens: ethers.parseEther("5000"), // 5000 IAI tokens
                    expectedCost: ethers.parseEther("3000"), // 3000 USDT (18 decimals)
                },
            ];

            for (const testCase of testCases) {
                // Approve USDT spending
                await usdt18Decimals
                    .connect(buyer1)
                    .approve(
                        await presaleWith18DecimalUSDT.getAddress(),
                        testCase.expectedCost
                    );

                // Verify the purchase
                await expect(
                    presaleWith18DecimalUSDT
                        .connect(buyer1)
                        .buyTokens(testCase.tokens)
                )
                    .to.emit(presaleWith18DecimalUSDT, "TokensPurchased")
                    .withArgs(
                        buyer1.address,
                        testCase.tokens,
                        testCase.expectedCost
                    );

                // Verify balances
                const receiverBalance = await usdt18Decimals.balanceOf(
                    revenueReceiver.address
                );
                expect(receiverBalance).to.equal(testCase.expectedCost);

                // Reset revenue receiver balance for next test
                await usdt18Decimals
                    .connect(revenueReceiver)
                    .transfer(owner.address, receiverBalance);
            }
        });

        it("Should handle fractional token amounts with 18 decimal USDT", async function () {
            const tokens = ethers.parseEther("150.5"); // 150.5 IAI tokens
            const expectedCost = ethers.parseEther("90.3"); // 90.3 USDT (18 decimals)

            // Get initial balances
            const initialUSDTBalance = await usdt18Decimals.balanceOf(
                buyer1.address
            );
            const initialTokenBalance = await iaiPresaleToken.balanceOf(
                buyer1.address
            );
            const initialReceiverBalance = await usdt18Decimals.balanceOf(
                revenueReceiver.address
            );

            await usdt18Decimals
                .connect(buyer1)
                .approve(
                    await presaleWith18DecimalUSDT.getAddress(),
                    expectedCost
                );

            await expect(
                presaleWith18DecimalUSDT.connect(buyer1).buyTokens(tokens)
            )
                .to.emit(presaleWith18DecimalUSDT, "TokensPurchased")
                .withArgs(buyer1.address, tokens, expectedCost);

            // Verify final balances
            const finalUSDTBalance = await usdt18Decimals.balanceOf(
                buyer1.address
            );
            const finalTokenBalance = await iaiPresaleToken.balanceOf(
                buyer1.address
            );
            const finalReceiverBalance = await usdt18Decimals.balanceOf(
                revenueReceiver.address
            );

            // Verify USDT deduction
            expect(initialUSDTBalance - finalUSDTBalance).to.equal(
                expectedCost
            );

            // Verify IAI token received
            expect(finalTokenBalance - initialTokenBalance).to.equal(tokens);

            // Verify revenue receiver got correct USDT amount
            expect(finalReceiverBalance - initialReceiverBalance).to.equal(
                expectedCost
            );
        });
    });
});
