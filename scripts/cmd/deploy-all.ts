import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";

interface DeploymentResult {
    address: string;
    txHash?: string;
}

const program = new Command("deploy-all")
    .description(
        "deploy all contracts (CallHelper, iAI Token, RewardDistributor)"
    )
    .requiredOption("--network <network>", "network to deploy to")
    .requiredOption("--contracts <path>", "path to contracts directory")
    .parse(process.argv);

async function deployCallHelper(
    deployer: any,
    network: string,
    contractsPath: string
): Promise<DeploymentResult> {
    console.log("\n=== Deploying CallHelper ===");
    const CallHelper = await ethers.getContractFactory("CallHelper");
    const deployed = await CallHelper.deploy(
        deployer.address,
        deployer.address
    );
    await deployed.waitForDeployment();
    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();

    const outDir = path.join(
        ".",
        "out",
        network,
        "deployment",
        "CallHelper",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);
    cliHelper.writeOutputResult(
        { address: deployedAddress, txHash: deployedTx?.hash },
        outDir,
        "result.json"
    );
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "CallHelper.sol")],
        outDir,
        "CallHelper.flatten.sol"
    );

    return { address: deployedAddress, txHash: deployedTx?.hash };
}

async function deployIAIToken(
    deployer: any,
    network: string,
    contractsPath: string
): Promise<DeploymentResult> {
    console.log("\n=== Deploying iAI Token ===");
    const IAIToken = await ethers.getContractFactory("IAIToken");
    const deployed = await IAIToken.deploy(deployer.address);
    await deployed.waitForDeployment();
    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();

    const outDir = path.join(
        ".",
        "out",
        network,
        "deployment",
        "iAIToken",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);
    cliHelper.writeOutputResult(
        { address: deployedAddress, txHash: deployedTx?.hash },
        outDir,
        "result.json"
    );
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "IAI.sol")],
        outDir,
        "IAI.flatten.sol"
    );

    return { address: deployedAddress, txHash: deployedTx?.hash };
}

async function deployRewardDistributor(
    rewardTokenAddress: string,
    network: string,
    contractsPath: string
): Promise<DeploymentResult> {
    console.log("\n=== Deploying RewardDistributor ===");
    const RewardDistributor = await ethers.getContractFactory(
        "RewardDistributor"
    );
    const deployed = await RewardDistributor.deploy(rewardTokenAddress);
    await deployed.waitForDeployment();
    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();

    const outDir = path.join(
        ".",
        "out",
        network,
        "deployment",
        "RewardDistributor",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);
    cliHelper.writeOutputResult(
        { address: deployedAddress, txHash: deployedTx?.hash },
        outDir,
        "result.json"
    );
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "RewardDistributor.sol")],
        outDir,
        "RewardDistributor.flatten.sol"
    );

    return { address: deployedAddress, txHash: deployedTx?.hash };
}

async function verifyDeployment(
    callHelperAddress: string,
    iaiTokenAddress: string,
    rewardDistributorAddress: string,
    deployer: any
) {
    console.log("\n=== Running Post-Deployment Verification ===");

    // Verify CallHelper
    const callHelper = await ethers.getContractAt(
        "CallHelper",
        callHelperAddress
    );
    const CALLER_ROLE = await callHelper.CALLER_ROLE();
    const deployerHasCallerRole = await callHelper.hasRole(
        CALLER_ROLE,
        deployer.address
    );
    console.log("CallHelper has CALLER_ROLE:", deployerHasCallerRole);

    // Verify IAIToken
    const iaiToken = await ethers.getContractAt("IAIToken", iaiTokenAddress);
    const tokenName = await iaiToken.name();
    const tokenSymbol = await iaiToken.symbol();
    const tokenDecimals = await iaiToken.decimals();
    console.log("IAIToken details verified:", {
        name: tokenName,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
    });

    // Verify RewardDistributor
    const rewardDistributor = await ethers.getContractAt(
        "RewardDistributor",
        rewardDistributorAddress
    );
    const rewardToken = await rewardDistributor.rewardToken();
    console.log(
        "RewardDistributor reward token verified:",
        rewardToken === iaiTokenAddress
    );

    // Test basic integration
    const MINT_AMOUNT = ethers.parseEther("1000");
    console.log("\nTesting basic integration:");

    // 1. Mint some tokens
    const mintTx = await iaiToken.mint(deployer.address, MINT_AMOUNT);
    await mintTx.wait();
    console.log("Minted tokens:", ethers.formatEther(MINT_AMOUNT));

    // 2. Approve RewardDistributor to spend tokens
    const approveTx = await iaiToken.approve(
        rewardDistributorAddress,
        MINT_AMOUNT
    );
    await approveTx.wait();
    console.log("Approved RewardDistributor to spend tokens");

    // 3. Fund RewardDistributor
    const fundTx = await rewardDistributor.addFunds(MINT_AMOUNT);
    await fundTx.wait();
    console.log("Funded RewardDistributor");

    // 4. Verify RewardDistributor balance
    const distributorBalance = await iaiToken.balanceOf(
        rewardDistributorAddress
    );
    console.log(
        "RewardDistributor balance:",
        ethers.formatEther(distributorBalance)
    );

    console.log("\n✅ Post-deployment verification completed successfully");
}

(async (): Promise<void> => {
    const { network, contracts: contractsPath } = program.opts();

    console.log(`Changing network to: ${network} ...`);
    await hre.changeNetwork(network);
    console.log(`Changed network to: ${network}`);

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    console.log(
        "Account balance:",
        (await ethers.provider.getBalance(deployer.address)).toString()
    );

    console.log("Compiling contracts...");
    await hre.run("compile");
    console.log("Compilation complete");

    // Deploy in sequence
    const callHelperResult = await deployCallHelper(
        deployer,
        network,
        contractsPath
    );
    console.log(`CallHelper deployed at: ${callHelperResult.address}`);

    const iaiTokenResult = await deployIAIToken(
        deployer,
        network,
        contractsPath
    );
    console.log(`iAI Token deployed at: ${iaiTokenResult.address}`);

    const rewardDistributorResult = await deployRewardDistributor(
        iaiTokenResult.address,
        network,
        contractsPath
    );
    console.log(
        `RewardDistributor deployed at: ${rewardDistributorResult.address}`
    );

    // Write final deployment summary
    const summaryDir = path.join(".", "out", network, "deployment", "summary");
    cliHelper.ensureDirExists(summaryDir);
    cliHelper.writeOutputResult(
        {
            callHelper: callHelperResult,
            iaiToken: iaiTokenResult,
            rewardDistributor: rewardDistributorResult,
        },
        summaryDir,
        "deployment-summary.json"
    );

    // Add post-deployment verification for forked networks
    if (network.toLowerCase().includes("forking")) {
        console.log(
            "\nForked network detected - running post-deployment verification"
        );
        try {
            await verifyDeployment(
                callHelperResult.address,
                iaiTokenResult.address,
                rewardDistributorResult.address,
                deployer
            );
        } catch (error) {
            console.error("❌ Post-deployment verification failed:", error);
            process.exit(1);
        }
    }

    console.log(
        "\nDeployment Complete! Summary written to:",
        path.join(summaryDir, "deployment-summary.json")
    );
})();