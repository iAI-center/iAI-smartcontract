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

const INITIAL_VRFI_TOKEN_SUPPLY = ethers.parseEther("1000000000"); // 1 billion tokens

async function main(): Promise<void> {
    const targetNetwork = await promptSafeChangeNetwork([
        SupportNetworks.polygonMainnet,
        SupportNetworks.polygonTestnet,
        SupportNetworks.forkingPolygonMainnet,
        SupportNetworks.forkingPolygonTestnet,
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

    const VRFIToken = await ethers.getContractFactory("VRFIToken");
    const deployed = await VRFIToken.deploy(
        adminWalletAddress,
        INITIAL_VRFI_TOKEN_SUPPLY
    );
    await deployed.waitForDeployment();
    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();
    console.log(
        `deployed VRFI Token contract to: ${deployedAddress} on ${targetNetwork} ...done with tx: ${deployedTx?.hash}`
    );
    cliHelper.writeHLine();

    // make output dir ...
    const outDir = cliHelper.ensureCommandOutputDirExists("deploy-vrfi-token");

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
        ["../../contracts/VRFI.sol"],
        outDir,
        "VRFI.flatten.sol"
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
