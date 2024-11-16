import { Command } from "commander";
import * as hre from "hardhat";
import { ethers } from "hardhat";
import * as path from "path";
import * as fs from "fs";
import {
    IAIToken__factory,
    RewardDistributor__factory,
} from "../../typechain-types";
import cliHelper from "./cli-helper";

interface Input {
    distributor: string;
    token: string;
    amount: string;
}

const program = new Command("add-funds-to-reward-distributor")
    .description("Add funds to RewardDistributor contract")
    .requiredOption("--input <path>", "path to input JSON file")
    .requiredOption("--network <network>", "network to deploy to")
    .parse(process.argv);

(async (): Promise<void> => {
    const { input: inputFilePath, network } = program.opts();
    const inputContent = fs.readFileSync(inputFilePath, "utf-8");
    const { distributor, token, amount } = JSON.parse(inputContent) as Input;

    console.log(`changing network to: ${network} ...`);
    await hre.changeNetwork(network);
    console.log(`changed network to: ${network}`);

    const [signer] = await ethers.getSigners();
    console.log("using account:", signer.address);

    // Get contracts
    const tokenContract = IAIToken__factory.connect(token, signer);
    const distributorContract = RewardDistributor__factory.connect(
        distributor,
        signer
    );

    // Get token decimals and convert amount to wei
    const decimals = await tokenContract.decimals();
    const fundAmountWei = ethers.parseUnits(amount, decimals);

    // Check balance and mint if needed
    const balance = await tokenContract.balanceOf(signer.address);
    if (balance < fundAmountWei) {
        console.log(
            `Current balance: ${ethers.formatUnits(balance, decimals)} tokens`
        );
        console.log(
            `Required amount: ${ethers.formatUnits(
                fundAmountWei,
                decimals
            )} tokens`
        );
        const needed = fundAmountWei - balance;

        const confirmation = await cliHelper.confirmPromptMessage(
            `Do you want to mint ${ethers.formatUnits(
                needed,
                decimals
            )} tokens?`
        );

        if (!confirmation) {
            console.log("Minting cancelled. Exiting...");
            process.exit(1);
        }

        console.log("Minting tokens...");
        const mintTx = await tokenContract.mint(signer.address, needed);
        await mintTx.wait();
        console.log(`Minted ${ethers.formatUnits(needed, decimals)} tokens`);
    }

    // Approve and add funds
    console.log("Approving tokens...");
    const approveTx = await tokenContract.approve(distributor, fundAmountWei);
    await approveTx.wait();

    console.log("Adding funds to RewardDistributor...");
    const addFundsTx = await distributorContract.addFunds(fundAmountWei);
    await addFundsTx.wait();

    // Save results
    const outDir = path.join(
        ".",
        "out",
        network,
        "add-funds",
        "RewardDistributor",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);

    cliHelper.writeOutputResult(
        {
            distributor,
            token,
            amount: amount.toString(),
            amountWei: fundAmountWei.toString(),
            addFundsTx: addFundsTx.hash,
        },
        outDir,
        "result.json"
    );

    console.log("Funds added successfully!");
})();
