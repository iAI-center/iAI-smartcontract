import { Command } from "commander";
import cliHelper from "../cli-helper";
import hre, { ethers } from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { makeOutDir, retry } from "./comon";
import moment from "moment";

interface Input {
    factoryAddress: string;
    stakedToken: string;
    rewardToken: string;
    rewardPerBlockInWei: string; // in wei unit
    startBlock: string;
    bonusEndBlock: string;
    poolLimitPerUserInWei: string; // in normal unit
    admin: string;
}

const POLYGON_BLOCK_TIME_IN_SEC = 2; // seconds

const program = new Command("deploy-farm-polygon")
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

    let [deployer] = await ethers.getSigners();
    console.log("deploying SmartChef Farm with the account:", deployer.address);

    {
        cliHelper.writeHLine();
        console.log(`please review the input ...`);
        console.log(input);
        cliHelper.writeHLine();
        if (
            !(await cliHelper.confirmPromptMessage(
                "please confirm to continue ..."
            ))
        ) {
            console.log("aborted");
            return;
        }
    }

    // check: deployer account has enough POL for deployment ...

    const accountBalance = await retry(() =>
        ethers.provider.getBalance(deployer.address)
    );
    console.log("account balance:", ethers.formatEther(accountBalance));
    console.log(
        `this will be set SmartChef Farm's admin to ${input.admin} ...`
    );
    if (input.admin === ethers.ZeroAddress) {
        console.log("admin address is empty, will not set admin");
        return;
    }
    if (accountBalance < ethers.parseUnits("1", 18)) {
        console.log(
            `account balance is not enough, need at least 1 POL to deploy`
        );
        return;
    }
    cliHelper.writeHLine();

    // check: deployer account has enough reward token for deployment ...

    const rewardToken = await ethers.getContractAt("ERC20", input.rewardToken);
    const rewardtokenName = await retry(() => rewardToken.name());
    const rewardDecimals = await retry(() => rewardToken.decimals());
    console.log(
        `reward token name: ${rewardtokenName} decimals: ${rewardDecimals.toString()}`
    );
    const deployerRewardBalance = await retry(() =>
        rewardToken.balanceOf(deployer.address)
    );
    console.log(
        "deployer reward token balance:",
        deployerRewardBalance.toString(),
        "decimals:",
        rewardDecimals.toString(),
        "=>",
        ethers.formatUnits(deployerRewardBalance, rewardDecimals)
    );
    const totalBlocks = BigInt(input.bonusEndBlock) - BigInt(input.startBlock);
    const totalRewardNeed = BigInt(input.rewardPerBlockInWei) * totalBlocks;
    console.log(
        `total reward need: ${totalRewardNeed.toString()} wei => ${ethers.formatUnits(
            totalRewardNeed,
            rewardDecimals
        )}`
    );
    if (deployerRewardBalance < totalRewardNeed) {
        console.log(
            `deployer reward token balance is not enough, need at least ${ethers.formatUnits(
                totalRewardNeed,
                rewardDecimals
            )} ${rewardtokenName}`
        );
        return;
    }
    cliHelper.writeHLine();

    // check: start and end block

    const currentBlock = await retry(() => ethers.provider.getBlockNumber());
    console.log("current block:", currentBlock);
    if (Number(input.startBlock) < currentBlock) {
        console.log(
            `start block ${input.startBlock} is less than current block ${currentBlock}`
        );
        return;
    }
    if (Number(input.bonusEndBlock) < Number(input.startBlock)) {
        console.log(
            `bonus end block ${input.bonusEndBlock} is less than start block ${input.startBlock}`
        );
        return;
    }
    const block = await retry(() => ethers.provider.getBlock(currentBlock));
    const currentBlockUnixTs = Number(block?.timestamp);
    console.log(
        "current block timestamp:",
        currentBlockUnixTs,
        "=>",
        moment.unix(currentBlockUnixTs).format()
    );

    console.log(
        `estimating start block time at block: ${input.startBlock} ...`
    );
    {
        const startBlock = parseInt(input.startBlock);
        const blockDiff = startBlock - currentBlock;
        const secDiff = blockDiff * POLYGON_BLOCK_TIME_IN_SEC;
        const startBlockUnixTs = currentBlockUnixTs + secDiff;
        console.log(
            `estimating start block time at block: ${input.startBlock} ...`,
            startBlockUnixTs,
            "=>",
            moment.unix(startBlockUnixTs).format()
        );
    }

    console.log(
        `estimating end block time at block: ${input.bonusEndBlock} ...`
    );
    {
        const endBlock = parseInt(input.bonusEndBlock);
        const blockDiff = endBlock - currentBlock;
        const secDiff = blockDiff * POLYGON_BLOCK_TIME_IN_SEC;
        const endBlockUnixTs = currentBlockUnixTs + secDiff;
        console.log(
            `estimating end block time at block: ${input.bonusEndBlock} ...`,
            endBlockUnixTs,
            "=>",
            moment.unix(endBlockUnixTs).format()
        );
    }

    cliHelper.writeHLine();

    const confirmToContinue = await cliHelper.confirmPromptMessage(
        "please confirm to continue ..."
    );
    if (!confirmToContinue) {
        console.log("aborted");
        return;
    }

    console.log(`approving ${totalRewardNeed} reward token to factory...`);

    const approveTx = await retry(async () =>
        rewardToken
            .connect(deployer)
            .approve(input.factoryAddress, totalRewardNeed)
    );
    const approveReceipt = await approveTx.wait();
    if (approveReceipt?.status !== 1) {
        console.log(
            "approve transaction failed, please check the transaction on Polygonscan"
        );
        return;
    }
    console.log("approved reward token to factory ...done");

    console.log("double check IAI Allowance for factory ...");
    {
        const allowance = await retry(() =>
            rewardToken.allowance(deployer.address, input.factoryAddress)
        );
        console.log(
            `reward token allowance for factory: ${ethers.formatEther(
                allowance
            )}`
        );
        if (allowance < totalRewardNeed) {
            console.log(
                `reward token allowance for factory is less than total reward need: ${ethers.formatEther(
                    totalRewardNeed
                )}`
            );
            return;
        }
        console.log(
            `reward token allowance for factory is enough: ${ethers.formatEther(
                allowance
            )}`
        );
    }

    const smartchefFactory = await ethers.getContractAt(
        "SmartChefFactory",
        input.factoryAddress
    );

    // deploy new farm ...
    console.log("starting deploy new farm with arguments ...");
    cliHelper.writeHLine();
    console.log("input arguments:");
    console.log("stakedToken:", input.stakedToken);
    console.log("rewardToken:", input.rewardToken);
    console.log(
        "rewardPerBlock:",
        input.rewardPerBlockInWei,
        "=>",
        ethers.formatEther(input.rewardPerBlockInWei)
    );
    console.log("startBlock:", input.startBlock);
    console.log("bonusEndBlock:", input.bonusEndBlock);
    console.log("poolLimitPerUser:", input.poolLimitPerUserInWei);
    console.log("admin:", input.admin);
    cliHelper.writeHLine();

    if (
        !(await cliHelper.confirmPromptMessage(
            "please confirm to continue ..."
        ))
    ) {
        console.log("aborted");
        return;
    }

    console.log("calling deployPool on SmartChefFactory...");
    const tx = await retry(async () =>
        smartchefFactory
            .connect(deployer)
            .deployPool(
                input.stakedToken,
                input.rewardToken,
                input.rewardPerBlockInWei,
                input.startBlock,
                input.bonusEndBlock,
                input.poolLimitPerUserInWei,
                input.admin
            )
    );
    const txReceipt = await retry(() => tx.wait());
    if (txReceipt?.status !== 1) {
        console.log(
            "deployPool transaction failed, please check the transaction on Polygonscan"
        );
        return;
    }

    console.log(
        "calling deployPool on SmartChefFactory... done with tx:",
        tx.hash
    );

    const NewSmartChefContractEvent = smartchefFactory.interface.getEvent(
        "NewSmartChefContract"
    );
    let deployedPool: string | undefined;
    for (const l of txReceipt?.logs || []) {
        const event = smartchefFactory.interface.parseLog(l);
        if (!event || event.name !== NewSmartChefContractEvent!.name) continue;
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

    console.log(
        "deploying SmartChefFactory's Farm ...done with address:",
        deployedPool
    );

    // recheck all farm parameter
    cliHelper.writeHLine();
    {
        const smartChef = await ethers.getContractAt(
            "SmartChefInitializable",
            deployedPool
        );
        const stakedToken = await retry(() => smartChef.stakedToken());
        const rewardToken = await retry(() => smartChef.rewardToken());
        const rewardPerBlock = await retry(() => smartChef.rewardPerBlock());
        const startBlock = await retry(() => smartChef.startBlock());
        const bonusEndBlock = await retry(() => smartChef.bonusEndBlock());
        const poolLimitPerUser = await retry(() =>
            smartChef.poolLimitPerUser()
        );
        const owner = await retry(() => smartChef.owner());

        console.log("stakedToken:", stakedToken);
        console.log("rewardToken:", rewardToken);
        console.log(
            "rewardPerBlock:",
            rewardPerBlock,
            "=>",
            ethers.formatEther(rewardPerBlock)
        );
        console.log("startBlock:", startBlock);
        console.log("bonusEndBlock:", bonusEndBlock);
        console.log("poolLimitPerUser:", poolLimitPerUser);
        console.log("admin:", owner);

        const totalRewardDistributed =
            (bonusEndBlock - startBlock) * rewardPerBlock;
        console.log(
            "total reward distributed:",
            totalRewardDistributed.toString(),
            "=>",
            ethers.formatEther(totalRewardDistributed)
        );
    }
    cliHelper.writeHLine();

    // write output files ...

    const outDir = makeOutDir("polygonMainnet", [
        "deployment",
        "smartchef-farm",
    ]);

    cliHelper.writeOutputResult(
        {
            newFarm: deployedPool,
        },
        outDir,
        "address.json"
    );
    console.log(`written output result to: ${outDir}/address.json`);
    cliHelper.writeHLine();

    console.log("flattening SmartChefInitializable.sol file...");
    await cliHelper.flattenSolidity2File(
        [path.join(contractsPath, "SmartChefInitializable.sol")],
        outDir,
        "SmartChefInitializable.sol.flatten.sol"
    );
    console.log("flattened sol file... done");
    cliHelper.writeHLine();
})();
