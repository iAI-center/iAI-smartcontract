import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { EtherscanProvider } from "ethers";

interface WhitelistEntry {
    address: string;
    amount: string;
}

interface Input {
    presaleContractAddress: string;
    whitelistings: WhitelistEntry[];
}

const program = new Command("deploy-presale-v2")
    .description("deploy Presale (V2) related contracts")
    .requiredOption("--input <path>", "path to input JSON file")
    .requiredOption("--network <network>", "network to deploy to")
    .requiredOption("--contracts <path>", "path to contracts directory")
    .parse(process.argv);

(async (): Promise<void> => {
    const [owner] = await ethers.getSigners();

    const { input: inputFilePath, network } = program.opts();
    const inputContent = fs.readFileSync(inputFilePath, "utf-8");
    const input = JSON.parse(inputContent) as Input;

    console.log(`changing network to: ${network} ...`);
    await hre.changeNetwork(network);
    console.log(`changed network to: ${network}`);

    const [deployer] = await ethers.getSigners();
    console.log("deploying contracts with account:", deployer.address);

    console.log("compiling ...");
    await hre.run("compile");
    console.log("compiling done");

    const presale = await ethers.getContractAt(
        "IAIPresaleV2",
        input.presaleContractAddress
    );

    // check owner ...
    const ownerAddress = await presale.owner();
    if (ethers.getAddress(ownerAddress) !== ethers.getAddress(owner.address)) {
        throw new Error(
            `owner mismatch: expected ${owner.address}, got ${ownerAddress}`
        );
    }

    const usdtTokenAddress = await presale.usdtToken();
    const usdt = await ethers.getContractAt("ERC20", usdtTokenAddress);
    const usdtDecimals = await usdt.decimals();

    const whitelistingTxHashes = [];
    const perBatch = 50;
    const batches = Math.ceil(input.whitelistings.length / perBatch);
    for (let i = 0; i < batches; i++) {
        const start = i * perBatch;
        const end = Math.min((i + 1) * perBatch, input.whitelistings.length);
        const batch = input.whitelistings.slice(start, end);
        console.log(
            `whitelisting batch ${i + 1}/${batches} ... total: ${batch.length}`
        );
        const tx = await presale.connect(deployer).batchAddToWhitelist(
            batch.map((entry) => entry.address),
            batch.map((entry) => ethers.parseUnits(entry.amount, usdtDecimals))
        );
        const txReceipt = await tx.wait();
        console.log(
            `whitelisted batch ${i + 1}/${batches} ...done with tx: ${
                txReceipt!.hash
            }`
        );
        whitelistingTxHashes.push(txReceipt!.hash);
    }

    // Create output directory
    const outDir = path.join(
        ".",
        "out",
        network,
        "presale-add-whitelistings",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);

    // Write execute results
    const executeResult = {
        whitelistingTxHashes,
    };

    cliHelper.writeOutputResult(executeResult, outDir, "result.json");
    cliHelper.writeOutputResult(
        cliHelper.JSONStringify(hre.config),
        outDir,
        "hardhat-config.json"
    );
})();
