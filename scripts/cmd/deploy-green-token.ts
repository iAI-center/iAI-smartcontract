import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";
import {
    promptSafeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";

const INITIAL_GREEN_TOKEN_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens

async function main(): Promise<void> {
    const targetNetwork = await promptSafeChangeNetwork([
        SupportNetworks.polygonMainnet,
        SupportNetworks.polygonTestnet,
        SupportNetworks.forkingPolygonMainnet,
        SupportNetworks.forkingPolygonTestnet,
        SupportNetworks.bscMainnet,
        SupportNetworks.bscTestnet,
        SupportNetworks.forkingBscMainnet,
        SupportNetworks.forkingBscTestnet,
    ]);
    if (!targetNetwork) {
        console.error("No network selected. Exiting...");
        process.exit(1);
    }

    console.log(`changed network to: ${targetNetwork} ...`);

    const [deployer] = await ethers.getSigners();
    console.log("deploying contract with the account:", deployer.address);
    const accountBalance = await ethers.provider.getBalance(deployer.address);
    console.log(
        "account balance:",
        ethers.formatEther(accountBalance),
        "(",
        accountBalance.toString(),
        ")"
    );

    console.log("compiling ...");
    await hre.run("compile");
    console.log("compiling ...done");

    const adminWallet = await hre.ethers.provider.getSigner();
    const adminWalletAddress = await adminWallet.getAddress();
    const balanceBefore = await hre.ethers.provider.getBalance(
        adminWalletAddress
    );

    const GREENToken = await ethers.getContractFactory("GREENToken");
    const deployed = (await GREENToken.deploy(
        adminWalletAddress,
        INITIAL_GREEN_TOKEN_SUPPLY
    )) as any;
    await deployed.waitForDeployment();
    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();
    console.log(
        `deployed GREEN Token contract to: ${deployedAddress} on ${targetNetwork} ...done with tx: ${deployedTx?.hash}`
    );
    cliHelper.writeHLine();

    const balanceAfter = await hre.ethers.provider.getBalance(
        adminWalletAddress
    );
    const balanceDiff = balanceBefore - balanceAfter;
    console.log(
        `admin wallet balance before: ${ethers.formatEther(
            balanceBefore
        )} (${balanceBefore.toString()}) after: ${ethers.formatEther(
            balanceAfter
        )} (${balanceAfter.toString()}) diff: ${ethers.formatEther(
            balanceDiff
        )} (${balanceDiff.toString()})`
    );

    const greenTokenBalance = await deployed.balanceOf(adminWalletAddress);
    console.log(
        `admin wallet GREEN Token balance: ${ethers.formatEther(
            greenTokenBalance
        )} (${greenTokenBalance.toString()})`
    );

    // make output dir ...
    const outDir = cliHelper.ensureCommandOutputDirExists("deploy-green-token");

    // write output result ...
    cliHelper.writeOutputResult(
        {
            address: deployedAddress,
            txHash: deployedTx?.hash,
        },
        outDir,
        "result.json"
    );

    // flatten sol file to output dir ...
    console.log("flattening sol file...");
    await cliHelper.flattenSolidity2File(
        ["../../contracts/GREENToken.sol"],
        outDir,
        "GREENToken.flatten.sol"
    );
    console.log("flattened sol file... done");
}

main()
    .then(() => {
        console.log("Deployment script completed successfully.");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error during deployment:", error);
        process.exit(1);
    });
