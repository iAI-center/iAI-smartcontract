import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { CallHelper, IAIToken, RewardDistributor } from "../typechain-types";

describe("Contract Deployment and Integration", function () {
    let iAIAddress: string;
    let rewardDistributorAddress: string;
    let callHelperAddress: string;

    let iAI: IAIToken;
    let rewardDistributor: RewardDistributor;
    let callHelper: CallHelper;

    let owner: HardhatEthersSigner;
    let addr1: HardhatEthersSigner;
    let addr2: HardhatEthersSigner;

    beforeEach(async function () {
        // Get signers
        [owner, addr1, addr2] = await ethers.getSigners();

        // Deploy IAI token with initial supply
        const initialSupply = ethers.parseEther("1000000"); // 1 million tokens
        const IAI = await ethers.getContractFactory("IAIToken");
        const iAI_ = await IAI.deploy(owner.address, initialSupply);
        await iAI_.waitForDeployment();
        iAIAddress = await iAI_.getAddress();

        // Deploy RewardDistributor
        const RewardDistributor = await ethers.getContractFactory(
            "RewardDistributor"
        );
        const rewardDistributor_ = await RewardDistributor.deploy(
            await iAI_.getAddress()
        );
        await rewardDistributor_.waitForDeployment();
        rewardDistributorAddress = await rewardDistributor_.getAddress();

        // Deploy CallHelper
        const CallHelper = await ethers.getContractFactory("CallHelper");
        const callHelper_ = await CallHelper.deploy(
            owner.address,
            owner.address
        );
        await callHelper_.waitForDeployment();
        callHelperAddress = await callHelper_.getAddress();

        iAI = await ethers.getContractAt("IAIToken", iAIAddress);
        rewardDistributor = await ethers.getContractAt(
            "RewardDistributor",
            rewardDistributorAddress
        );
        callHelper = await ethers.getContractAt(
            "CallHelper",
            callHelperAddress
        );
    });

    describe("Deployment", function () {
        it("Should deploy all contracts successfully", async function () {
            expect(iAIAddress).to.be.properAddress;
            expect(rewardDistributorAddress).to.be.properAddress;
            expect(callHelperAddress).to.be.properAddress;
        });
    });

    describe("Token Initial Supply and Permissions", function () {
        it("Should set the initial supply correctly", async function () {
            const initialSupply = ethers.parseEther("1000000");
            expect(await iAI.balanceOf(owner.address)).to.equal(initialSupply);
        });

        it("Should set the total supply correctly", async function () {
            const initialSupply = ethers.parseEther("1000000");
            expect(await iAI.totalSupply()).to.equal(initialSupply);
        });
    });

    describe("RewardDistributor Functionality", function () {
        it("Should allow adding funds to RewardDistributor", async function () {
            const fundAmount = ethers.parseEther("100");
            await iAI.approve(rewardDistributorAddress, fundAmount);
            await rewardDistributor.addFunds(fundAmount);
            expect(await iAI.balanceOf(rewardDistributorAddress)).to.equal(
                fundAmount
            );
        });

        it("Should allow distribution of rewards", async function () {
            const fundAmount = ethers.parseEther("100");
            const rewardAmount = ethers.parseEther("10");

            // Fund directly from owner's initial supply
            await iAI.approve(rewardDistributorAddress, fundAmount);
            await rewardDistributor.addFunds(fundAmount);

            // Distribute
            const recipients = [addr1.address, addr2.address];
            const amounts = [rewardAmount, rewardAmount];
            await rewardDistributor.distribute(recipients, amounts);

            expect(await iAI.balanceOf(addr1.address)).to.equal(rewardAmount);
            expect(await iAI.balanceOf(addr2.address)).to.equal(rewardAmount);
        });
    });

    describe("CallHelper Integration", function () {
        it("Should distribute rewards through CallHelper", async function () {
            const fundAmount = ethers.parseEther("100");
            const rewardAmount = ethers.parseEther("10");

            // Fund directly from owner's initial supply
            await iAI.approve(rewardDistributorAddress, fundAmount);
            await rewardDistributor.addFunds(fundAmount);

            // Grant DISTRIBUTOR_ROLE to CallHelper
            const DISTRIBUTOR_ROLE = await rewardDistributor.DISTRIBUTOR_ROLE();
            await rewardDistributor.grantRole(
                DISTRIBUTOR_ROLE,
                callHelperAddress
            );

            // Prepare distribution data
            const recipients = [addr1.address, addr2.address];
            const amounts = [rewardAmount, rewardAmount];

            // Encode the function call
            const distributeFunctionData =
                rewardDistributor.interface.encodeFunctionData("distribute", [
                    recipients,
                    amounts,
                ]);

            // Execute through CallHelper
            const bytes32String = ethers.encodeBytes32String("1"); // Convert to bytes32
            await callHelper.call(
                [rewardDistributorAddress],
                [distributeFunctionData],
                [bytes32String]
            );

            expect(await iAI.balanceOf(addr1.address)).to.equal(rewardAmount);
            expect(await iAI.balanceOf(addr2.address)).to.equal(rewardAmount);
        });
    });
});
