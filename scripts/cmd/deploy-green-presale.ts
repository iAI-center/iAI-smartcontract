import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";
import { Wallet } from "ethers";
import {
    promptSafeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";

async function parseTokenAmount(
    token: string,
    amount: string
): Promise<bigint> {
    const tokenContract = await ethers.getContractAt("ERC20", token);
    const decimals = await tokenContract.decimals();
    return ethers.parseUnits(amount, decimals);
}

(async (): Promise<void> => {
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
    console.log("deploying contracts with account:", deployer.address);

    const provider = await ethers.provider;
    const gasBalance = await provider.getBalance(deployer.address);
    console.log("deployer's account balance:", ethers.formatEther(gasBalance));

    console.log("compiling ...");
    await hre.run("compile");
    console.log("compiling done");

    /**
     * @description usdtToken address
     */
    let usdtToken: string = "";
    /**
     * @description deployed GREEN Presale Token address
     * @note if this is empty, it will deploy a new GREENPresaleToken contract
     */
    let greenPresaleToken: string = "";
    /**
     * @description revenue receiver address
     */
    let revenueReceiver: string = "";
    /**
     * @description token price in wei (1 ether = 10^18 wei)
     */
    let tokenPrice: bigint = 0n;
    /**
     * @description start time of the presale in unix timestamp (seconds since epoch)
     */
    let startTime: bigint = 0n;
    /**
     * @description end time of the presale in unix timestamp (seconds since epoch)
     */
    let endTime: bigint = 0n;
    /**
     * @description maximum sale amount in wei (1 ether = 10^18 wei)
     */
    let maxSaleAmount: bigint = 0n;
    /**
     * @description minimum purchase amount in wei (1 ether = 10^18 wei)
     */
    let minPurchaseAmount: bigint = 0n;
    /**
     * @description whether whitelist is enabled or not
     */
    let isWhitelistEnabled: boolean = false;
    /**
     * @description default maximum USDT amount per user in wei (1 ether = 10^18 wei)
     */
    let defaultUSDTMaxAmount: bigint = 0n;
    /**
     * @description owner of GREENPresale to transfer ownership to
     */
    let initOwnerAddress = "";
    const GREENPresaleTokenInfo = {
        name: "GREEN Presale Token",
        symbol: "GREEN Presale",
        decimals: 18,
        totalSupply: ethers.parseUnits("6500000.0", 18),
    };

    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet
    ) {
        usdtToken = "";
        greenPresaleToken = "";
        revenueReceiver = "";
        tokenPrice = 0n;
        startTime = 0n;
        endTime = 0n;
        maxSaleAmount = 0n;
        minPurchaseAmount = 0n;
        isWhitelistEnabled = false;
        defaultUSDTMaxAmount = 0n;
        initOwnerAddress = "";
    } else if (
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingPolygonTestnet
    ) {
        usdtToken = "0x4E1610F4104e541B202eD8040a97e44245BB1Bd6";
        greenPresaleToken = "";
        revenueReceiver = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        tokenPrice = await parseTokenAmount(usdtToken, "0.06");
        startTime = 0n;
        endTime = 2840140800n;
        maxSaleAmount = ethers.parseUnits(
            "12500000.0",
            GREENPresaleTokenInfo.decimals
        );
        minPurchaseAmount = ethers.parseUnits(
            "0.1",
            GREENPresaleTokenInfo.decimals
        );
        isWhitelistEnabled = true;
        defaultUSDTMaxAmount = await parseTokenAmount(usdtToken, "1000000.0");
        initOwnerAddress = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        GREENPresaleTokenInfo.totalSupply = maxSaleAmount;
    } else if (
        targetNetwork === SupportNetworks.bscMainnet ||
        targetNetwork === SupportNetworks.forkingBscMainnet
    ) {
        const greenToken = "0x"; // TODO: Update with actual GREEN token address on BSC Mainnet
        usdtToken = "0x55d398326f99059ff775485246999027b3197955";
        greenPresaleToken = greenToken; // use GREEN token as presale token
        revenueReceiver = "0x48b3BbadfC4CbBc75ea754955c9D069D467060Ec"; // for receiving USDT
        tokenPrice = await parseTokenAmount(usdtToken, "0.015"); // price per presale token
        startTime = 0n; // already started
        endTime = 2840140800n; // Thu Jan 01 2060 07:00:00 GMT+0700 (Indochina Time)
        maxSaleAmount = ethers.parseUnits(
            "500000.0",
            GREENPresaleTokenInfo.decimals
        );
        minPurchaseAmount = 0n; // no minimum purchase amount
        isWhitelistEnabled = false; // not required whitelisting
        defaultUSDTMaxAmount = 2n ** 256n - 1n; // likely unlimit
        initOwnerAddress = "0xaf6D06B03b609AE796Ae94F724124BADD0AFC053"; // admin address
        GREENPresaleTokenInfo.totalSupply = ethers.parseUnits(
            "500000.0",
            GREENPresaleTokenInfo.decimals
        );
    } else if (
        targetNetwork === SupportNetworks.bscTestnet ||
        targetNetwork === SupportNetworks.forkingBscTestnet
    ) {
        const greenToken = "0x"; // TODO: Update with actual GREEN token address on BSC Testnet
        usdtToken = "0x481a5636d9738f691f08c6f8dAc8117742C664C1";
        greenPresaleToken = greenToken; // use GREEN token as presale token
        revenueReceiver = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        tokenPrice = await parseTokenAmount(usdtToken, "0.06");
        startTime = 0n;
        endTime = 2840140800n;
        maxSaleAmount = ethers.parseUnits(
            "12500000.0",
            GREENPresaleTokenInfo.decimals
        );
        minPurchaseAmount = ethers.parseUnits(
            "0.1",
            GREENPresaleTokenInfo.decimals
        );
        isWhitelistEnabled = true;
        defaultUSDTMaxAmount = await parseTokenAmount(usdtToken, "1000000.0");
        initOwnerAddress = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        GREENPresaleTokenInfo.totalSupply = maxSaleAmount;
    }

    // checking usdt decimals
    {
        console.log(`checking USDT decimals ...`);
        const usdt = await ethers.getContractAt("ERC20", usdtToken, deployer);
        const usdtDecimals = await usdt.decimals();
        const confirmed = await cliHelper.confirmPromptMessage(
            `USDT decimals are ${usdtDecimals}. Do you want to continue?`
        );
        if (!confirmed) {
            console.log("Aborting deployment.");
            return;
        }
    }

    const deployerBalanceBefore = await ethers.provider.getBalance(deployer);

    if (!greenPresaleToken) {
        console.log(`deploying Presale Token to ${targetNetwork}...`);
        const confirmed = await cliHelper.confirmPromptMessage(
            "Since deployedPresaleTokenAddr is not specified, this will deploy GREENPresaleToken contract. Do you want to continue?"
        );
        if (!confirmed) {
            console.log("Aborting deployment.");
            return;
        }

        const PresaleToken = await ethers.getContractFactory(
            "GREENPresaleToken"
        );
        const { name, symbol, decimals, totalSupply } = GREENPresaleTokenInfo;
        const presaleToken = await PresaleToken.deploy(
            name,
            symbol,
            totalSupply,
            decimals
        );
        await presaleToken.waitForDeployment();
        const tokenAddress = await presaleToken.getAddress();
        console.log(
            `GREENPresaleToken deployed to: ${tokenAddress} at tx: ${
                presaleToken.deploymentTransaction()?.hash
            }`
        );
        greenPresaleToken = tokenAddress;
    } else {
        console.log(
            `using existing GREENPresaleToken address: ${greenPresaleToken}`
        );
        console.log(`checking deployed GREENPresaleToken contract...`);
        const PresaleToken = await ethers.getContractAt(
            "GREENPresaleToken",
            greenPresaleToken
        );
        const name = await PresaleToken.name();
        const symbol = await PresaleToken.symbol();
        const decimals = await PresaleToken.decimals();
        const totalSupply = await PresaleToken.totalSupply();
        console.log(
            `GREENPresaleToken: name=${name}, symbol=${symbol}, decimals=${decimals}, totalSupply=${ethers.formatEther(
                totalSupply
            )}`
        );
        console.log(`comparing ...`);
        console.log(`name: ${name} === ${GREENPresaleTokenInfo.name}`);
        console.log(`symbol: ${symbol} === ${GREENPresaleTokenInfo.symbol}`);
        console.log(
            `decimals: ${decimals} === ${GREENPresaleTokenInfo.decimals}`
        );
        console.log(
            `totalSupply: ${ethers.formatEther(
                totalSupply
            )} === ${ethers.formatEther(GREENPresaleTokenInfo.totalSupply)}`
        );
        if (
            name !== GREENPresaleTokenInfo.name ||
            symbol !== GREENPresaleTokenInfo.symbol ||
            Number(decimals) !== GREENPresaleTokenInfo.decimals ||
            totalSupply !== GREENPresaleTokenInfo.totalSupply
        ) {
            console.error("Presale token info mismatch");
            process.exit(1);
        }
    }

    console.log(`related token info ...`);
    {
        console.log(`--------------------------------`);

        const usdt = await ethers.getContractAt("ERC20", usdtToken);
        const usdtName = await usdt.name();
        const usdtSymbol = await usdt.symbol();
        const usdtDecimals = await usdt.decimals();

        const presaleToken = await ethers.getContractAt(
            "ERC20",
            greenPresaleToken
        );
        const presaleTokenName = await presaleToken.name();
        const presaleTokenSymbol = await presaleToken.symbol();
        const presaleTokenDecimals = await presaleToken.decimals();

        console.log(
            `USDT: name=${usdtName}, symbol=${usdtSymbol}, decimals=${usdtDecimals}, address=${usdtToken}`
        );
        console.log(
            `GREENPresaleToken: name=${presaleTokenName}, symbol=${presaleTokenSymbol}, decimals=${presaleTokenDecimals}, address=${greenPresaleToken}`
        );

        console.log(`--------------------------------`);

        if (
            !(await cliHelper.confirmPromptMessage(
                "Do you want to continue with the deployment?"
            ))
        ) {
            console.log("Aborting deployment.");
            return;
        }
    }

    // Deploy Presale with ether conversion
    console.log(`deploying Presale contract to ${targetNetwork}...`);
    {
        const confirmed = await cliHelper.confirmPromptMessage(
            "confirm to continue with the deployment of Presale contract."
        );
        if (!confirmed) {
            console.log("Aborting deployment.");
            return;
        }
    }

    let presaleDeploymentTx = "";
    const Presale = await ethers.getContractFactory("GREENPresale");
    const presale = (await Presale.deploy(
        usdtToken,
        greenPresaleToken,
        revenueReceiver,
        tokenPrice,
        startTime,
        endTime,
        maxSaleAmount,
        minPurchaseAmount,
        isWhitelistEnabled,
        defaultUSDTMaxAmount
    )) as any;
    await presale.waitForDeployment();
    const presaleAddress = await presale.getAddress();
    console.log(`Presale contract deployed to: ${presaleAddress}`);
    presaleDeploymentTx = presale.deploymentTransaction()?.hash!;

    // transfer Presale ownership to new owner if specified
    let transferPresaleOwnershipTx = "";
    if (
        initOwnerAddress &&
        ethers.getAddress(initOwnerAddress) !== ethers.ZeroAddress &&
        (await presale.owner()) !== ethers.getAddress(initOwnerAddress)
    ) {
        console.log(`transferring ownership to: ${initOwnerAddress}`);
        const tx = await presale.transferOwnership(initOwnerAddress);
        const receipt = await tx.wait();
        if (!receipt || !receipt.status) {
            console.error("Failed to transfer Presale ownership.");
            process.exit(1);
        }
        console.log(`ownership transferred to: ${initOwnerAddress}`);
        console.log(`checking new ownership: ${await presale.owner()} ...done`);
        transferPresaleOwnershipTx = receipt!.hash;
        console.log(`-------------------`);
    }

    // Create output directory
    const outDir = cliHelper.ensureCommandOutputDirExists(
        "deploy-green-presale"
    );
    cliHelper.ensureDirExists(outDir);

    // Write deployment results
    const deploymentResult = {
        presaleToken: {
            address: greenPresaleToken,
        },
        usdt: {
            address: usdtToken,
        },
        presale: {
            address: presaleAddress,
            txHash: presaleDeploymentTx,
        },
        transferPresaleOwnershipTx,
    };

    cliHelper.writeOutputResult(deploymentResult, outDir, "result.json");

    // check deployer's spending gas used
    {
        const deployerBalanceAfter = await ethers.provider.getBalance(deployer);
        const gasUsed = deployerBalanceBefore - deployerBalanceAfter;
        console.log(
            `deployer's spending gas used: ${ethers.formatUnits(
                gasUsed,
                "ether"
            )} ether`
        );
    }

    // Flatten contract files
    const contractsPath = "../../contracts";
    await Promise.all(
        [
            path.join(contractsPath, "GREENPresaleToken.sol"),
            path.join(contractsPath, "GREENPresale.sol"),
        ].map((contractPath) =>
            cliHelper.flattenSolidity2File(
                [contractPath],
                outDir,
                path.basename(contractPath) + ".flatten.sol"
            )
        )
    );

    // running test only on Forking node
    if (
        targetNetwork === SupportNetworks.forkingPolygonTestnet ||
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingBscMainnet
    ) {
        console.log(`======================================================`);
        console.log("running test on forking node ...");
        const usdt = await ethers.getContractAt("ERC20", usdtToken, deployer);
        const presaleToken = await ethers.getContractAt(
            "ERC20",
            greenPresaleToken,
            deployer
        );
        const deployerUsdtBalance = await usdt.balanceOf(deployer.address);
        const deployerPresaleTokenBalance = await presaleToken.balanceOf(
            deployer.address
        );
        const presaleContractUSDTBalance = await usdt.balanceOf(presaleAddress);

        const greenHolder = await ethers.getImpersonatedSigner(
            "0x48b3BbadfC4CbBc75ea754955c9D069D467060Ec"
        );
        const admin = await ethers.getImpersonatedSigner(initOwnerAddress);
        console.log(`admin address: ${admin.address}`);

        const testUser = Wallet.createRandom(ethers.provider);
        const usdtHolderUser = await ethers.getImpersonatedSigner(
            "0xEF3aeFf9A5F61C6Dda33069c58C1434006e13B20"
        ); // only on bsc

        console.log(
            `usdtHolder's usdt balance: ${ethers.formatUnits(
                await usdt.balanceOf(usdtHolderUser.address),
                await usdt.decimals()
            )}`
        );

        console.log(`transfer gas to testUser ...`);
        {
            const tx = await admin.sendTransaction({
                to: testUser.address,
                value: ethers.parseUnits("0.01", "ether"),
            });
            const receipt = await tx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer gas to testUser.");
                process.exit(1);
            }
            console.log(`transferred gas to testUser: ${tx.hash} ...done`);
        }

        console.log(`transfer gas to green token holder ...`);
        {
            const tx = await admin.sendTransaction({
                to: greenHolder.address,
                value: ethers.parseUnits("0.01", "ether"),
            });
            const receipt = await tx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer gas to green token holder.");
                process.exit(1);
            }
            console.log(
                `transferred gas to green token holder: ${tx.hash} ...done`
            );
        }

        console.log(`transfer USDT to testUser ...`);
        {
            const tx = await usdt
                .connect(usdtHolderUser)
                .transfer(
                    testUser.address,
                    ethers.parseUnits("1000000.0", await usdt.decimals())
                );
            const receipt = await tx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer USDT to testUser.");
                process.exit(1);
            }
            console.log(`transferred USDT to testUser: ${tx.hash} ...done`);
        }

        console.log(
            `testUser's usdt balance: ${ethers.formatUnits(
                await usdt.balanceOf(testUser.address),
                await usdt.decimals()
            )}`
        );
        console.log(
            `testUser's green presale token balance: ${ethers.formatUnits(
                await presaleToken.balanceOf(testUser.address),
                await presaleToken.decimals()
            )}`
        );
    }
})();
