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

    console.log(
        "\nDeployment Complete! Summary written to:",
        path.join(summaryDir, "deployment-summary.json")
    );
})();
