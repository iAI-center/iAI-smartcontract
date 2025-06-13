import { Command } from "commander";
import cliHelper from "../cli-helper";
import { ethers } from "hardhat";
import hre from "hardhat";
import path from "path";
import fs from "fs";
import { makeOutDir, retry } from "./comon";

interface Input {
    newOwnerAddress: string;
}

const program = new Command("deploy-smartchef")
    .description("deploy SmartChef")
    .requiredOption("--input <path>", "path to input JSON file")
    .requiredOption("--network <network>", "network to deploy to")
    .requiredOption("--contracts <path>", "path to contracts directory")
    .parse(process.argv);

(async (): Promise<void> => {
    const {
        input: inputFilePath,
        network,
        contracts: contractsPath,
    } = program.opts();
    const inputContent = fs.readFileSync(inputFilePath, "utf-8");
    const input = JSON.parse(inputContent) as Input;

    console.log("compiling ...");
    await retry(() => hre.run("compile"));
    console.log("compiling ...done");

    console.log("changing network to: %s ...", network);
    await retry(() => hre.switchNetwork(network));
    console.log("changed network to: %s ...", network);

    const [deployer] = await ethers.getSigners();
    console.log(
        "deploying SmartChefFactory with the account:",
        deployer.address
    );
    const accountBalance = await retry(() =>
        ethers.provider.getBalance(deployer.address)
    );
    console.log("account balance:", ethers.formatEther(accountBalance));
    console.log(
        `after deployed, will transfer the ownership to ${input.newOwnerAddress} ...`
    );
    if (input.newOwnerAddress === ethers.ZeroAddress) {
        console.log("new owner address is empty, will not transfer ownership");
    }

    // confirm to continue
    const confirmToContinue = await cliHelper.confirmPromptMessage(
        "please confirm to continue ..."
    );
    if (!confirmToContinue) {
        console.log("aborted");
        return;
    }

    console.log("deploying SmartChefFactory ...");

    const SmartChefFactory = await ethers.getContractFactory(
        "SmartChefFactory"
    );
    const deployed = await retry(() => SmartChefFactory.deploy());
    await retry(() => deployed.waitForDeployment());

    const deployedTx = deployed.deploymentTransaction();
    const deployedAddress = await deployed.getAddress();
    console.log(
        `deployed SmartChefFactory contract to: ${deployedAddress} on ${network} ...done with tx: ${deployedTx?.hash}`
    );

    // transfer ownership if required ...
    {
        const smartFactory = await ethers.getContractAt(
            "SmartChefFactory",
            deployedAddress
        );
        const oldOwner = await retry(() => smartFactory.owner());
        if (
            input.newOwnerAddress !== ethers.ZeroAddress &&
            input.newOwnerAddress !== oldOwner
        ) {
            console.log(
                `transfering ownership to: ${input.newOwnerAddress} ...`
            );
            const transferOwnershipTx = await retry(async () =>
                smartFactory.transferOwnership(input.newOwnerAddress)
            );
            await retry(() => transferOwnershipTx.wait());
            console.log(
                `transfered ownership to: ${input.newOwnerAddress} ...done with tx: ${transferOwnershipTx.hash}`
            );
        }
    }

    console.log("deploying SmartChefFactory ...done");

    const outDir = makeOutDir(network, ["deployment", "smartchef-factory"]);

    cliHelper.writeOutputResult(
        {
            smartChefFactory: deployedAddress,
        },
        outDir,
        "address.json"
    );
    console.log(`written output result to: ${outDir}/address.json`);
    cliHelper.writeHLine();

    console.log("flattening SmartChefFactory.sol file...");
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "SmartChefFactory.sol")],
        outDir,
        "SmartChefFactory.flatten.sol"
    );
    console.log(
        "flattened sol file... done output written to:",
        path.join(outDir, "SmartChefFactory.flatten.sol")
    );
    cliHelper.writeHLine();
})();
