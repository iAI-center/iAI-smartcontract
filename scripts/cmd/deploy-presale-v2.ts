import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { Wallet } from "ethers";

interface Input {
    iaiToken: {
        name: string;
        symbol: string;
        decimal: number;
        initialSupply: string;
        address?: string;
    };
    usdt: {
        name: string;
        symbol: string;
        decimal: number;
        address?: string;
    };
    presale: {
        tokenPrice: string; // in ether
        startTime: number; // unix timestamp
        endTime: number; // unix timestamp
        maxSaleAmount: string; // in ether
        minPurchase: string; // in ether
        revenueReceiver: string; // address to receive revenue
        isWhitelistEnabled: boolean; // enable whitelist
        defaultMaxUSDTPerUser: string; // in ether
    };
    newOwner: string; // address of new owner to tranfer ownsership to
    generateNewWalletForTestUSDTHolder: boolean;
}

const USE_OVER_GAS_LIMIT = false;
const gasSetup = USE_OVER_GAS_LIMIT
    ? {
          maxFeePerGas: ethers.parseUnits("100", "gwei"),
          maxPriorityFeePerGas: ethers.parseUnits("100", "gwei"),
      }
    : {};

const program = new Command("deploy-presale-v2")
    .description("deploy Presale (V2) related contracts")
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

    const provider = await ethers.provider;
    const gasPrice = (await provider.getFeeData()).gasPrice;
    console.log("gas price:", gasPrice!.toString());

    const gasBalance = await provider.getBalance(deployer.address);
    console.log("deployer's account balance:", ethers.formatEther(gasBalance));

    console.log("compiling ...");
    await hre.run("compile");
    console.log("compiling done");

    let justDeployedIAIPresaleToken = false;

    // Deploy IAIPresaleToken
    let iaiPresaleTokenDeploymenTx = "";
    let iaiPresaleTokenAddress = "";
    if (input.iaiToken.address) {
        iaiPresaleTokenAddress = input.iaiToken.address;
        const erc20 = await ethers.getContractAt(
            "ERC20",
            input.iaiToken.address
        );
        if ((await erc20.name()) !== input.iaiToken.name) {
            console.log(
                `given token (${input.iaiToken.address}) name does not match: ${input.iaiToken.name}`
            );
        }
        if ((await erc20.symbol()) !== input.iaiToken.symbol) {
            console.log(
                `given token (${input.iaiToken.address}) symbol does not match: ${input.iaiToken.symbol}`
            );
        }
        if ((await erc20.decimals()) !== BigInt(input.iaiToken.decimal)) {
            console.log(
                `given token (${input.iaiToken.address}) decimal does not match: ${input.iaiToken.decimal}`
            );
        }
    } else {
        console.log(`deploying IAIPresaleToken ...`);
        const IAIPresaleToken = await ethers.getContractFactory(
            "IAIPresaleToken"
        );
        const iaiToken = await IAIPresaleToken.deploy(
            input.iaiToken.name,
            input.iaiToken.symbol,
            ethers.parseUnits(
                input.iaiToken.initialSupply,
                input.iaiToken.decimal
            ),
            input.iaiToken.decimal,
            {
                ...gasSetup,
            }
        );
        await iaiToken.waitForDeployment();
        const tokenAddress = await iaiToken.getAddress();
        console.log(`IAIPresaleToken deployed to: ${tokenAddress}`);
        iaiPresaleTokenAddress = tokenAddress;
        iaiPresaleTokenDeploymenTx = iaiToken.deploymentTransaction()?.hash!;
        justDeployedIAIPresaleToken = true;
    }

    // Deploy USDT
    let usdtDeploymentTx = "";
    let usdtTokenAddress = "";
    let testUsdtHolderPk = "";
    if (input.usdt.address) {
        usdtTokenAddress = input.usdt.address;
        const erc20 = await ethers.getContractAt("ERC20", input.usdt.address);
        if ((await erc20.name()) !== input.usdt.name) {
            console.log(
                `given token (${input.usdt.address}) name does not match: ${input.usdt.name}`
            );
        }
        if ((await erc20.symbol()) !== input.usdt.symbol) {
            console.log(
                `given token (${input.usdt.address}) symbol does not match: ${input.usdt.symbol}`
            );
        }
        if ((await erc20.decimals()) !== BigInt(input.usdt.decimal)) {
            console.log(
                `given token (${input.usdt.address}) decimal does not match: ${input.usdt.decimal}`
            );
        }
    } else {
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDT = await MockERC20.deploy(
            input.usdt.name,
            input.usdt.symbol,
            input.usdt.decimal,
            ethers.parseUnits("1000000000", input.usdt.decimal)
        );
        await mockUSDT.waitForDeployment();
        const mockUSDTAddress = await mockUSDT.getAddress();
        console.log(`MockUSDT deployed to: ${mockUSDTAddress}`);
        usdtTokenAddress = mockUSDTAddress;
        usdtDeploymentTx = mockUSDT.deploymentTransaction()?.hash!;

        if (input.generateNewWalletForTestUSDTHolder) {
            const holder = Wallet.createRandom();
            const transferAmount = ethers.parseUnits(
                "5000000",
                input.usdt.decimal
            );
            console.log(`transfering usdt to holder: ${holder.address}`);
            await mockUSDT
                .connect(deployer)
                .transfer(holder.address, transferAmount);
            console.log(
                `${ethers.formatUnits(
                    transferAmount,
                    input.usdt.decimal
                )} usdt transferred to holder: ${holder.address} ...done`
            );
            testUsdtHolderPk = holder.privateKey;
            console.log(`USDT holder private key: ${testUsdtHolderPk}`);
        }
    }

    // Deploy Presale with ether conversion
    let presaleDeploymentTx = "";
    const Presale = await ethers.getContractFactory("IAIPresaleV2");
    const presale = await Presale.deploy(
        usdtTokenAddress,
        iaiPresaleTokenAddress,
        input.presale.revenueReceiver,
        ethers.parseUnits(input.presale.tokenPrice, input.usdt.decimal),
        input.presale.startTime,
        input.presale.endTime,
        ethers.parseEther(input.presale.maxSaleAmount),
        ethers.parseEther(input.presale.minPurchase),
        input.presale.isWhitelistEnabled,
        ethers.parseUnits(
            input.presale.defaultMaxUSDTPerUser,
            input.usdt.decimal
        ),
        {
            ...gasSetup,
        }
    );
    await presale.waitForDeployment();
    const presaleAddress = await presale.getAddress();
    console.log(`Presale contract deployed to: ${presaleAddress}`);
    presaleDeploymentTx = presale.deploymentTransaction()?.hash!;

    // transfer ownership to new owner if specified
    let transferOwnershipTx = "";
    if (
        input.newOwner.length > 0 &&
        ethers.getAddress(input.newOwner) !== ethers.ZeroAddress
    ) {
        console.log(`transferring ownership to: ${input.newOwner}`);
        const tx = await presale.transferOwnership(input.newOwner, {
            ...gasSetup,
        });
        const receipt = await tx.wait();
        console.log(`ownership transferred to: ${input.newOwner}`);
        console.log(`checking new ownership: ${await presale.owner()} ...done`);
        transferOwnershipTx = receipt!.hash;
    }

    // transfer iai presale token to presale contract, if it's first deployed in this script
    if (justDeployedIAIPresaleToken) {
        console.log(
            `transfering iai presale token to presale contract: ${presaleAddress}`
        );
        const confirmed = await cliHelper.confirmPromptMessage(
            "confirm to transfer?"
        );
        if (confirmed) {
            const iaiToken = await ethers.getContractAt(
                "ERC20",
                iaiPresaleTokenAddress
            );
            const tx = await iaiToken
                .connect(deployer)
                .transfer(
                    presaleAddress,
                    ethers.parseEther(input.presale.maxSaleAmount),
                    { ...gasSetup }
                );
            await tx.wait();
            console.log(
                `transfered iai presale token to presale contract: ${presaleAddress}`
            );
        } else {
            console.log(
                "skipped transfering iai presale token to presale contract"
            );
        }
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
            txHash: presaleDeploymentTx,
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
            path.join(contractsPath, "IAIPresaleV2.sol"),
        ].map((contractPath) =>
            cliHelper.flattenSolidity2File(
                [contractPath],
                outDir,
                path.basename(contractPath) + ".flatten.sol"
            )
        )
    );

    const afterDeployGasBalance = await provider.getBalance(deployer.address);
    console.log(
        "deployer's account balance (after deployment):",
        ethers.formatEther(afterDeployGasBalance)
    );
})();
