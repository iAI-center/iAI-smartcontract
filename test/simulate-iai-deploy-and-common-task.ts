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

        // Deploy IAI token
        const IAI = await ethers.getContractFactory("IAIToken");
        const iAI_ = await IAI.deploy(owner.address);
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

    describe("Token Minting and Permissions", function () {
        it("Should allow owner to mint iAI tokens", async function () {
            const mintAmount = ethers.parseEther("1000");
            await iAI.mint(owner.address, mintAmount);
            expect(await iAI.balanceOf(owner.address)).to.equal(mintAmount);
        });

        it("Should revert when minting zero amount", async function () {
            await expect(iAI.mint(owner.address, 0)).to.be.reverted;
        });

        it("Should revert when non-owner tries to mint", async function () {
            const mintAmount = ethers.parseEther("1000");
            await expect(iAI.connect(addr1).mint(addr1.address, mintAmount)).to
                .be.reverted;
        });

        it("Should handle multiple mints to the same address correctly", async function () {
            const mintAmount1 = ethers.parseEther("1000");
            const mintAmount2 = ethers.parseEther("2000");

            await iAI.mint(addr1.address, mintAmount1);
            await iAI.mint(addr1.address, mintAmount2);

            expect(await iAI.balanceOf(addr1.address)).to.equal(
                mintAmount1 + mintAmount2
            );
        });

        it("Should handle minting maximum allowed amount", async function () {
            const maxUint256 = ethers.MaxUint256;
            await iAI.mint(owner.address, maxUint256);
            expect(await iAI.balanceOf(owner.address)).to.equal(maxUint256);

            // Should revert when trying to mint more after reaching max
            await expect(iAI.mint(owner.address, 1)).to.be.reverted;
        });
    });

    describe("RewardDistributor Functionality", function () {
        it("Should allow adding funds to RewardDistributor", async function () {
            const fundAmount = ethers.parseEther("100");
            await iAI.mint(owner.address, fundAmount);
            await iAI.approve(rewardDistributorAddress, fundAmount);
            await rewardDistributor.addFunds(fundAmount);
            expect(await iAI.balanceOf(rewardDistributorAddress)).to.equal(
                fundAmount
            );
        });

        it("Should allow distribution of rewards", async function () {
            const fundAmount = ethers.parseEther("100");
            const rewardAmount = ethers.parseEther("10");

            // Mint and fund
            await iAI.mint(owner.address, fundAmount);
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

            // Mint and fund
            await iAI.mint(owner.address, fundAmount);
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
