import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { Wallet } from "ethers";

interface Input {
    iaiToken: {
        address?: string;
        name: string;
        symbol: string;
        initialSupply: string;
    };
    usdt: {
        address?: string;
        name: string;
        symbol: string;
    };
    presale: {
        tokenPrice: string; // in ether
        startTime: number; // unix timestamp
        endTime: number; // unix timestamp
        maxSaleAmount: string; // in ether
        isWhitelistOnly: boolean;
        minPurchase: string; // in ether
        maxPurchase: string; // in ether
        whitelist: string[]; // addresses
    };
    newOwner: string; // address of new owner to tranfer ownsership to
    generateNewWalletForTestUSDTHolder: boolean;
}

const program = new Command("deploy-presale")
    .description("deploy Presale related contracts")
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

    console.log(`changing network to: ${network} ...`);
    await hre.changeNetwork(network);
    console.log(`changed network to: ${network}`);

    const [deployer] = await ethers.getSigners();
    console.log("deploying contracts with account:", deployer.address);

    console.log("compiling ...");
    await hre.run("compile");
    console.log("compiling done");

    // Deploy IAIPresaleToken
    let iaiPresaleTokenDeploymenTx = "";
    let iaiPresaleTokenAddress = "";
    if (input.iaiToken.address) {
        iaiPresaleTokenAddress = input.iaiToken.address;
    } else {
        const IAIPresaleToken = await ethers.getContractFactory(
            "IAIPresaleToken"
        );
        const iaiToken = await IAIPresaleToken.deploy(
            input.iaiToken.name,
            input.iaiToken.symbol,
            ethers.parseEther(input.iaiToken.initialSupply!)
        );
        await iaiToken.waitForDeployment();
        const iaiTokenAddress = await iaiToken.getAddress();
        console.log(`IAIPresaleToken deployed to: ${iaiTokenAddress}`);
        iaiPresaleTokenAddress = iaiTokenAddress;
        iaiPresaleTokenDeploymenTx = iaiToken.deploymentTransaction()?.hash!;
    }

    // Deploy USDT
    let usdtDeploymentTx = "";
    let usdtTokenAddress = "";
    let testUsdtHolderPk = "";
    if (input.usdt.address) {
        usdtTokenAddress = input.usdt.address;
    } else {
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDT = await MockERC20.deploy(
            input.usdt.name,
            input.usdt.symbol
        );
        await mockUSDT.waitForDeployment();
        const mockUSDTAddress = await mockUSDT.getAddress();
        console.log(`MockUSDT deployed to: ${mockUSDTAddress}`);
        usdtTokenAddress = mockUSDTAddress;
        usdtDeploymentTx = mockUSDT.deploymentTransaction()?.hash!;

        if (input.generateNewWalletForTestUSDTHolder) {
            const holder = Wallet.createRandom();
            const transferAmount = ethers.parseEther("500000");
            console.log(`transfering usdt to holder: ${holder.address}`);
            await mockUSDT
                .connect(deployer)
                .transfer(holder.address, transferAmount);
            console.log(
                `${ethers.formatEther(
                    transferAmount
                )} usdt transferred to holder: ${holder.address} ...done`
            );
            testUsdtHolderPk = holder.privateKey;
            console.log(`USDT holder private key: ${testUsdtHolderPk}`);
        }
    }

    // Deploy Presale with ether conversion
    let presaleDeploymentTx = "";
    const Presale = await ethers.getContractFactory("IAIPresale");
    const presale = await Presale.deploy(
        usdtTokenAddress,
        iaiPresaleTokenAddress,
        ethers.parseEther(input.presale.tokenPrice),
        input.presale.startTime,
        input.presale.endTime,
        ethers.parseEther(input.presale.maxSaleAmount),
        input.presale.isWhitelistOnly,
        ethers.parseEther(input.presale.minPurchase),
        ethers.parseEther(input.presale.maxPurchase)
    );
    await presale.waitForDeployment();
    const presaleAddress = await presale.getAddress();
    console.log(`Presale contract deployed to: ${presaleAddress}`);
    presaleDeploymentTx = presale.deploymentTransaction()?.hash!;

    // transfer ownership to new owner if specified
    let transferOwnershipTx = "";
    if (ethers.getAddress(input.newOwner) !== ethers.ZeroAddress) {
        console.log(`transferring ownership to: ${input.newOwner}`);
        const tx = await presale.transferOwnership(input.newOwner);
        const receipt = await tx.wait();
        console.log(`ownership transferred to: ${input.newOwner}`);
        console.log(`checking new ownership: ${await presale.owner()} ...done`);
        transferOwnershipTx = receipt!.hash;
    }

    // Create output directory
    const outDir = path.join(
        ".",
        "out",
        network,
        "deployment",
        "Presale",
        `${+new Date()}`
    );
    cliHelper.ensureDirExists(outDir);

    // Write deployment results
    const deploymentResult = {
        iaiToken: {
            address: iaiPresaleTokenAddress,
            txHash: iaiPresaleTokenDeploymenTx,
        },
        usdt: {
            address: usdtTokenAddress,
            txHash: usdtDeploymentTx,
        },
        testUsdtHolderPk: testUsdtHolderPk ?? undefined,
        presale: {
            address: presaleAddress,
            txHash: presale.deploymentTransaction()?.hash,
        },
        transferOwnershipTx,
    };

    cliHelper.writeOutputResult(deploymentResult, outDir, "result.json");
    cliHelper.writeOutputResult(
        cliHelper.JSONStringify(hre.config),
        outDir,
        "hardhat-config.json"
    );

    // Flatten contract files
    await Promise.all(
        [
            path.join(contractsPath, "IAIPresaleToken.sol"),
            path.join(contractsPath, "test", "MockERC20.sol"),
            path.join(contractsPath, "IAIPresale.sol"),
        ].map((contractPath) =>
            cliHelper.flattenSolidity2File(
                [contractPath],
                outDir,
                path.basename(contractPath) + ".flatten.sol"
            )
        )
    );
})();
