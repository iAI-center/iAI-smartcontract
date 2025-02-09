import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";

// Helper function: retry until success
async function retry<T>(
    fn: () => Promise<T>,
    label: string,
    delayMs = 1000
): Promise<T> {
    while (true) {
        try {
            return await fn();
        } catch (err) {
            console.error(
                `Error in ${label}: ${err}. Retrying in ${delayMs}ms...`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
}

interface SmartChefInput {
    stakedToken: string;
    rewardToken: string;
    rewardPerBlock: string; // in normal unit
    startBlock: string;
    bonusEndBlock: string;
    poolLimitPerUser: string; // in normal unit
    admin: string;
}

const program = new Command("deploy-smartchef")
    .description("deploy SmartChef contract via SmartChefFactory")
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
    const input = JSON.parse(inputContent) as SmartChefInput;

    console.log(`changing network to: ${network} ...`);
    await retry(() => hre.changeNetwork(network), "changeNetwork");
    console.log(`changed network to: ${network} ...`);
    console.log(hre.config["networks"][network]);

    if (network.includes("forking")) {
        await retry(
            () => hre.network.provider.send("hardhat_mine", ["0x1"]),
            "hardhat_mine"
        );
    }

    const [deployer] = await ethers.getSigners();
    console.log(
        "deploying SmartChefFactory with the account:",
        deployer.address
    );
    console.log(
        "account balance:",
        (await ethers.provider.getBalance(deployer.address)).toString()
    );

    console.log("compiling ...");
    await retry(() => hre.run("compile"), "compile");
    console.log("compiling ...done");

    const rewardToken = await retry(
        () => ethers.getContractAt("ERC20", input.rewardToken),
        "getContractAt ERC20"
    );
    const rewardDecimals = await retry(
        () => rewardToken.decimals(),
        "rewardToken.decimals"
    );
    console.log("reward token decimals:", rewardDecimals.toString());

    const balance = await retry(
        () => rewardToken.balanceOf(deployer.address),
        "rewardToken.balanceOf"
    );
    console.log(
        "deployer reward token balance:",
        balance.toString(),
        "decimals:",
        rewardDecimals.toString(),
        "=>",
        ethers.formatUnits(balance, rewardDecimals)
    );

    const totalBlocks = BigInt(input.bonusEndBlock) - BigInt(input.startBlock);
    const totalRewardNeed =
        ethers.parseUnits(input.rewardPerBlock, rewardDecimals) * totalBlocks;
    console.log(
        `total reward need: ${totalRewardNeed.toString()} wei => ${ethers.formatUnits(
            totalRewardNeed,
            rewardDecimals
        )}`
    );

    console.log("deploying SmartChefFactory contract...");
    const SmartChefFactory = await retry(
        () => ethers.getContractFactory("SmartChefFactory"),
        "getContractFactory SmartChefFactory"
    );
    const factory = await retry(
        () => SmartChefFactory.deploy(),
        "SmartChefFactory.deploy"
    );
    await retry(() => factory.waitForDeployment(), "factory.waitForDeployment");
    const factoryAddress = await retry(
        () => factory.getAddress(),
        "factory.getAddress"
    );
    console.log("SmartChefFactory deployed at:", factoryAddress);

    console.log("approving reward token to factory...");
    await retry(
        () => rewardToken.approve(factoryAddress, totalRewardNeed),
        "rewardToken.approve"
    );
    console.log("approved reward token to factory ...done");

    console.log("calling deployPool on SmartChefFactory...");
    const tx = await retry(
        () =>
            factory.deployPool(
                input.stakedToken,
                input.rewardToken,
                ethers.parseUnits(input.rewardPerBlock, rewardDecimals),
                input.startBlock,
                input.bonusEndBlock,
                input.poolLimitPerUser,
                input.admin
            ),
        "factory.deployPool"
    );
    const txReceipt = await retry(() => tx.wait(), "tx.wait");

    const NewSmartChefContractEvent = factory.interface.getEvent(
        "NewSmartChefContract"
    );
    let deployedPool: string | undefined;
    for (const l of txReceipt?.logs || []) {
        const event = factory.interface.parseLog(l);
        if (!event || event.name !== NewSmartChefContractEvent.name) continue;
        console.log(
            `NewSmartChefContract event: ${JSON.stringify(event.args)}`
        );
        deployedPool = event.args.smartChef;
    }

    if (!deployedPool) {
        throw new Error(
            "Cannot find the deployed address from tx logs... SmartChef pool not deployed"
        );
    }

    console.log(`SmartChef pool deployed at: ${deployedPool}`);

    cliHelper.writeHLine();

    console.log("creating output directory...");
    const outDir = path.join(
        ".",
        "out",
        network,
        "deployment",
        "SmartChefFactory+Farm",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);
    console.log("output directory created.");

    console.log("writing deployment result...");
    cliHelper.writeOutputResult(
        {
            factoryAddress,
            poolAddress: deployedPool,
            txHash: txReceipt?.hash,
        },
        outDir,
        "result.json"
    );
    console.log("deployment result written.");

    console.log("writing hardhat config...");
    cliHelper.writeOutputResult(
        cliHelper.JSONStringify(hre.config),
        outDir,
        "hardhat-config.json"
    );
    console.log("hardhat config written.");

    console.log("flattening SmartChefInitializable.sol file...");
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "SmartChefInitializable.sol")],
        outDir,
        "SmartChefInitializable.flatten.sol"
    );
    console.log("flattened sol file... done");
    // ...existing code...
})();
