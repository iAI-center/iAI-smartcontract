import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import {
    promptSafeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";
import { VRFIPresale } from "../../typechain-types";
import { Wallet } from "ethers";

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
     * @description deployed VRFI Presale Token address
     * @note if this is empty, it will deploy a new VRFIPresaleToken contract
     */
    let vrfiPresaleToken: string = "";
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
     * @description owner of VRFIPresale to transfer ownership to
     */
    let initOwnerAddress = "";
    const VRFIPresaleTokenInfo = {
        name: "VRFI Presale Token",
        symbol: "VRFI Presale",
        decimals: 18,
        totalSupply: ethers.parseUnits("6500000.0", 18),
    };

    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet
    ) {
        usdtToken = "";
        vrfiPresaleToken = "";
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
        vrfiPresaleToken = "";
        revenueReceiver = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        tokenPrice = await parseTokenAmount(usdtToken, "0.06");
        startTime = 0n;
        endTime = 2840140800n;
        maxSaleAmount = ethers.parseUnits(
            "12500000.0",
            VRFIPresaleTokenInfo.decimals
        );
        minPurchaseAmount = ethers.parseUnits(
            "0.1",
            VRFIPresaleTokenInfo.decimals
        );
        isWhitelistEnabled = true;
        defaultUSDTMaxAmount = await parseTokenAmount(usdtToken, "1000000.0");
        initOwnerAddress = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        VRFIPresaleTokenInfo.totalSupply = maxSaleAmount;
    } else if (
        targetNetwork === SupportNetworks.bscMainnet ||
        targetNetwork === SupportNetworks.forkingBscMainnet
    ) {
        const vrfiToken = "0xdDa7Ab46d5139e114A38A1AdAA5d8ca299c87479";
        usdtToken = "0x55d398326f99059ff775485246999027b3197955";
        vrfiPresaleToken = vrfiToken; // since 2025-07-09: we use VRFI token as presale token
        revenueReceiver = "0x48b3BbadfC4CbBc75ea754955c9D069D467060Ec"; // for receiving USDT
        tokenPrice = await parseTokenAmount(usdtToken, "0.015"); // price per presale token
        startTime = 0n; // already started
        endTime = 2840140800n; // Thu Jan 01 2060 07:00:00 GMT+0700 (Indochina Time)
        maxSaleAmount = ethers.parseUnits(
            "500000.0",
            VRFIPresaleTokenInfo.decimals
        );
        minPurchaseAmount = 0n; // no minimum purchase amount
        isWhitelistEnabled = false; // not required whitelisting
        defaultUSDTMaxAmount = 2n ** 256n - 1n; // likely unlimit
        initOwnerAddress = "0xaf6D06B03b609AE796Ae94F724124BADD0AFC053"; // admin address
        VRFIPresaleTokenInfo.totalSupply = ethers.parseUnits(
            "500000.0",
            VRFIPresaleTokenInfo.decimals
        );
    } else if (
        targetNetwork === SupportNetworks.bscTestnet ||
        targetNetwork === SupportNetworks.forkingBscTestnet
    ) {
        const vrfiToken = "0xa776249E1F1685963258Bbf90501964B20081754";
        usdtToken = "0x481a5636d9738f691f08c6f8dAc8117742C664C1";
        vrfiPresaleToken = vrfiToken; // since 2025-07-09: we use VRFI token as presale token
        revenueReceiver = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        tokenPrice = await parseTokenAmount(usdtToken, "0.06");
        startTime = 0n;
        endTime = 2840140800n;
        maxSaleAmount = ethers.parseUnits(
            "12500000.0",
            VRFIPresaleTokenInfo.decimals
        );
        minPurchaseAmount = ethers.parseUnits(
            "0.1",
            VRFIPresaleTokenInfo.decimals
        );
        isWhitelistEnabled = true;
        defaultUSDTMaxAmount = await parseTokenAmount(usdtToken, "1000000.0");
        initOwnerAddress = "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57";
        VRFIPresaleTokenInfo.totalSupply = maxSaleAmount;
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

    if (!vrfiPresaleToken) {
        console.log(`deploying Presale Token to ${targetNetwork}...`);
        const confirmed = await cliHelper.confirmPromptMessage(
            "Since deployedPresaleTokenAddr is not specified, this will deploy VRFIPresaleToken contract. Do you want to continue?"
        );
        if (!confirmed) {
            console.log("Aborting deployment.");
            return;
        }

        const PresaleToken = await ethers.getContractFactory(
            "VRFIPresaleToken"
        );
        const { name, symbol, decimals, totalSupply } = VRFIPresaleTokenInfo;
        const presaleToken = await PresaleToken.deploy(
            name,
            symbol,
            totalSupply,
            decimals
        );
        await presaleToken.waitForDeployment();
        const tokenAddress = await presaleToken.getAddress();
        console.log(
            `VRFIPresaleToken deployed to: ${tokenAddress} at tx: ${
                presaleToken.deploymentTransaction()?.hash
            }`
        );
        vrfiPresaleToken = tokenAddress;
    } else {
        console.log(
            `using existing VRFIPresaleToken address: ${vrfiPresaleToken}`
        );
        console.log(`checking deployed VRFIPresaleToken contract...`);
        const PresaleToken = await ethers.getContractAt(
            "VRFIPresaleToken",
            vrfiPresaleToken
        );
        const name = await PresaleToken.name();
        const symbol = await PresaleToken.symbol();
        const decimals = await PresaleToken.decimals();
        const totalSupply = await PresaleToken.totalSupply();
        console.log(
            `VRFIPresaleToken: name=${name}, symbol=${symbol}, decimals=${decimals}, totalSupply=${ethers.formatEther(
                totalSupply
            )}`
        );
        console.log(`comparing ...`);
        console.log(`name: ${name} === ${VRFIPresaleTokenInfo.name}`);
        console.log(`symbol: ${symbol} === ${VRFIPresaleTokenInfo.symbol}`);
        console.log(
            `decimals: ${decimals} === ${VRFIPresaleTokenInfo.decimals}`
        );
        console.log(
            `totalSupply: ${ethers.formatEther(
                totalSupply
            )} === ${ethers.formatEther(VRFIPresaleTokenInfo.totalSupply)}`
        );
        if (
            name !== VRFIPresaleTokenInfo.name ||
            symbol !== VRFIPresaleTokenInfo.symbol ||
            Number(decimals) !== VRFIPresaleTokenInfo.decimals ||
            totalSupply !== VRFIPresaleTokenInfo.totalSupply
        ) {
            const confirmed = await cliHelper.confirmPromptMessage(
                `VRFIPresaleToken contract at ${vrfiPresaleToken} does not match the expected values. Do you want to continue?`
            );
            if (!confirmed) {
                console.log("Aborting deployment.");
                return;
            }
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
            vrfiPresaleToken
        );
        const presaleTokenName = await presaleToken.name();
        const presaleTokenSymbol = await presaleToken.symbol();
        const presaleTokenDecimals = await presaleToken.decimals();

        console.log(
            `USDT: name=${usdtName}, symbol=${usdtSymbol}, decimals=${usdtDecimals}, address=${usdtToken}`
        );
        console.log(
            `VRFIPresaleToken: name=${presaleTokenName}, symbol=${presaleTokenSymbol}, decimals=${presaleTokenDecimals}, address=${vrfiPresaleToken}`
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
    const Presale = await ethers.getContractFactory("VRFIPresale");
    const presale = (await Presale.deploy(
        usdtToken,
        vrfiPresaleToken,
        revenueReceiver,
        tokenPrice,
        startTime,
        endTime,
        maxSaleAmount,
        minPurchaseAmount,
        isWhitelistEnabled,
        defaultUSDTMaxAmount
    )) as any as VRFIPresale;
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
            console.error("Failed to transfer ownership.");
            process.exit(1);
        }
        console.log(`ownership transferred to: ${initOwnerAddress}`);
        console.log(`checking new ownership: ${await presale.owner()} ...done`);
        transferPresaleOwnershipTx = receipt!.hash;
        console.log(`-------------------`);
    }

    // // transfer PresaleToken ownership to new owner if specific
    // let transferPresaleTokenOwnershipTx = "";
    // {
    //     const vrfiPresaleToken_ = await ethers.getContractAt(
    //         "VRFIPresaleToken",
    //         vrfiPresaleToken
    //     );
    //     const tx = await vrfiPresaleToken_.transferOwnership(initOwnerAddress);
    //     const receipt = await tx.wait();
    //     if (!receipt || !receipt.status) {
    //         console.error("Failed to transfer PresaleToken ownership.");
    //         process.exit(1);
    //     }
    //     console.log(
    //         `PresaleToken ownership transferred to: ${initOwnerAddress}`
    //     );
    //     console.log(
    //         `checking new ownership: ${await vrfiPresaleToken_.owner()} ...done`
    //     );
    //     transferPresaleTokenOwnershipTx = receipt!.hash;
    //     console.log(`-------------------`);
    // }

    // // transfer vrfi presale token to presale contract, if it's first deployed in this script
    // {
    //     console.log(
    //         `transfering total ${ethers.formatEther(
    //             maxSaleAmount
    //         )} vrfi presale token to presale contract: ${presaleAddress}`
    //     );
    //     const presaleToken = await ethers.getContractAt(
    //         "ERC20",
    //         vrfiPresaleToken
    //     );
    //     const balance = await presaleToken.balanceOf(deployer.address);
    //     console.log(
    //         `deployer's vrfi presale token balance: ${ethers.formatEther(
    //             balance
    //         )}`
    //     );
    //     const confirmed = await cliHelper.confirmPromptMessage(
    //         "confirm to transfer?"
    //     );
    //     if (confirmed) {
    //         const tx = await presaleToken
    //             .connect(deployer)
    //             .transfer(presaleAddress, maxSaleAmount);
    //         const receipt = await tx.wait();
    //         if (receipt?.status !== 1) {
    //             console.error(
    //                 `Failed to transfer iai presale token to presale contract: ${presaleAddress}`
    //             );
    //         } else {
    //             console.log(
    //                 `transfered iai presale token to presale contract: ${presaleAddress} done ...at tx: ${tx.hash}`
    //             );
    //         }
    //     } else {
    //         console.log(
    //             "skipped transfering iai presale token to presale contract"
    //         );
    //     }
    // }

    // Create output directory
    const outDir = cliHelper.ensureCommandOutputDirExists(
        "deploy-vrfi-presale"
    );
    cliHelper.ensureDirExists(outDir);

    // Write deployment results
    const deploymentResult = {
        presaleToken: {
            address: vrfiPresaleToken,
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
            path.join(contractsPath, "VRFIPresaleToken.sol"),
            path.join(contractsPath, "VRFIPresale.sol"),
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
            vrfiPresaleToken,
            deployer
        );
        const deployerUsdtBalance = await usdt.balanceOf(deployer.address);
        const deployerPresaleTokenBalance = await presaleToken.balanceOf(
            deployer.address
        );
        const presaleContractUSDTBalance = await usdt.balanceOf(presaleAddress);

        const vrfiHolder = await ethers.getImpersonatedSigner(
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
            }
            console.log(`transferred gas to testUser: ${tx.hash} ...done`);
        }

        console.log(`transfer gas to vrfi token holder ...`);
        {
            const tx = await admin.sendTransaction({
                to: vrfiHolder.address,
                value: ethers.parseUnits("0.01", "ether"),
            });
            const receipt = await tx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer gas to vrfi token holder.");
            }
            console.log(
                `transferred gas to vrfi token holder: ${tx.hash} ...done`
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
            `testUser's vrfi presale token balance: ${ethers.formatUnits(
                await presaleToken.balanceOf(testUser.address),
                await presaleToken.decimals()
            )}`
        );
        console.log(
            `presale contract usdt balance: ${ethers.formatUnits(
                presaleContractUSDTBalance,
                await usdt.decimals()
            )}`
        );

        const presale = await ethers.getContractAt(
            "VRFIPresale",
            presaleAddress,
            deployer
        );
        {
            console.log(`checking presale status ...`);
            const status = await presale.getPresaleStatus();
            console.log(`presale status:`, status);

            const price = await presale.tokenPrice();
            console.log(
                `presale token price: ${ethers.formatUnits(
                    price,
                    await usdt.decimals()
                )} USDT`
            );
        }
        console.log(`-------------------------------------------`);

        const vrfiToken = await ethers.getContractAt(
            "VRFIToken",
            await presale.vrfiPresaleToken()
        );
        console.log(`transfer VRFI to presale contract ...`);
        {
            const transferTx = await vrfiToken
                .connect(vrfiHolder)
                .transfer(
                    presale.target,
                    await parseTokenAmount(
                        vrfiToken.target.toString(),
                        "500000"
                    )
                );
            const receipt = await transferTx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer VRFI to presale contract.");
                return;
            }
        }

        const testBuy = async (buyAmount: bigint) => {
            console.log(`---------------`);

            const approveTx = await usdt
                .connect(testUser)
                .approve(presaleAddress, buyAmount);
            const approveReceipt = await approveTx.wait();
            if (!approveReceipt || !approveReceipt.status) {
                console.error("Failed to approve 0.015 USDT for presale.");
            }
            console.log(`approved USDT for presale: ${approveTx.hash} ...done`);

            const estimatedReceived = await presale.estimateReceived(buyAmount);
            console.log(
                `estimated received vrfi presale token amount: ${ethers.formatUnits(
                    estimatedReceived,
                    await presaleToken.decimals()
                )} when buying ${ethers.formatUnits(
                    buyAmount,
                    await usdt.decimals()
                )} USDT`
            );

            const buyTx = await presale.connect(testUser).buyTokens(buyAmount);
            const buyReceipt = await buyTx.wait();
            if (!buyReceipt || !buyReceipt.status) {
                console.error("Failed to buy tokens from presale.");
            } else {
                console.log(
                    `bought tokens from presale: ${buyTx.hash} ...done`
                );
                const newDeployerPresaleTokenBalance =
                    await presaleToken.balanceOf(deployer.address);
            }

            const testUserNewUsdtBalance = await usdt.balanceOf(
                testUser.address
            );
            const testUserNewPresaleTokenBalance = await presaleToken.balanceOf(
                testUser.address
            );
            const presaleNewContractUSDTBalance = await usdt.balanceOf(
                presaleAddress
            );
            console.log(
                `testUser's new usdt balance: ${ethers.formatUnits(
                    testUserNewUsdtBalance,
                    await usdt.decimals()
                )}`
            );
            console.log(
                `testUser's new vrfi presale token balance: ${ethers.formatUnits(
                    testUserNewPresaleTokenBalance,
                    await presaleToken.decimals()
                )}`
            );
            const receiver = await presale.revenueReceiver();
            console.log(
                `presale contract's revenue receiver new usdt balance: ${ethers.formatUnits(
                    await usdt.balanceOf(receiver),
                    await usdt.decimals()
                )}`
            );

            console.log(
                `======================================================`
            );
        };

        await testBuy(ethers.parseUnits("0.015", await usdt.decimals()));
        await testBuy(
            ethers.parseUnits("0.015", await usdt.decimals()) * (500_000n - 1n)
        );

        // try to buy again should fail
        try {
            await testBuy(ethers.parseUnits("0.015", await usdt.decimals()));
        } catch (err) {
            const maxSellAmount = await presale.maxSaleAmount();
            console.log(
                `failed to buy right now since it reaches the max sell amount: ${ethers.formatEther(
                    maxSaleAmount
                )}`
            );
        }

        console.log(`increase maxSaleAmount ...`);
        {
            const tx = await presale
                .connect(admin)
                .setMaxSaleAmount(
                    ethers.parseUnits("600000", await presaleToken.decimals())
                );
            const receipt = await tx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to set max sale amount.");
            }
            console.log(`set max sale amount: ${tx.hash} ...done`);

            const newMaxSaleAmount = await presale.maxSaleAmount();
            console.log(
                `new max sale amount: ${ethers.formatEther(newMaxSaleAmount)}`
            );
        }

        console.log(`transfer VRFI to presale contract ...`);
        {
            const transferTx = await vrfiToken
                .connect(vrfiHolder)
                .transfer(
                    presale.target,
                    await parseTokenAmount(
                        vrfiToken.target.toString(),
                        "100000"
                    )
                );
            const receipt = await transferTx.wait();
            if (!receipt || !receipt.status) {
                console.error("Failed to transfer VRFI to presale contract.");
                return;
            }
        }

        await testBuy(ethers.parseUnits("0.015", await usdt.decimals()));

        console.log(`premature withdraw ...`);
        {
            const bp = await vrfiToken.balanceOf(presale.target);
            const ba = await vrfiToken.balanceOf(admin.address);

            console.log(`pause ...`);
            await presale.connect(admin).pause();
            console.log(`... paused`);

            await presale
                .connect(admin)
                .prematureWithdrawPresaleTokens(
                    await parseTokenAmount(vrfiToken.target.toString(), "1000")
                );
            const ap = await vrfiToken.balanceOf(presale.target);
            const aa = await vrfiToken.balanceOf(admin.address);
            console.log(
                "admin vrfi changed:",
                ethers.formatEther(ba),
                "=>",
                ethers.formatEther(aa)
            );
            console.log(
                `presale vrfi changed:", ${ethers.formatEther(
                    bp
                )}, "=>", ${ethers.formatEther(ap)}`
            );

            console.log(`resume ...`);
            await presale.connect(admin).unpause();
            console.log(`... resumed`);
        }

        await testBuy(ethers.parseUnits("0.015", await usdt.decimals()));

        console.log(`withdraw unsold tokens ...`);
        {
            const price = await presale.tokenPrice();
            const startTime = await presale.startTime();
            const endTime = await presale.endTime();
            const maxSaleAmount = await presale.maxSaleAmount();
            const whitelistEnabled = await presale.isWhitelistEnabled();
            console.log(`force end preiod`);
            const bn = await ethers.provider.getBlockNumber();
            const b = await ethers.provider.getBlock(bn);
            if (!b) throw Error(`Failed to get block`);
            await presale
                .connect(admin)
                .updatePresaleConfig(
                    price,
                    startTime,
                    b.timestamp - 1000,
                    maxSaleAmount,
                    whitelistEnabled
                );
            console.log(`... forced ended`);

            const bp = await vrfiToken.balanceOf(presale.target);
            const ba = await vrfiToken.balanceOf(admin.address);
            await presale.connect(admin).withdrawUnsoldPresaleTokens();
            const ap = await vrfiToken.balanceOf(presale.target);
            const aa = await vrfiToken.balanceOf(admin.address);
            console.log(
                "admin vrfi changed:",
                ethers.formatEther(ba),
                "=>",
                ethers.formatEther(aa)
            );
            console.log(
                `presale vrfi changed:", ${ethers.formatEther(
                    bp
                )}, "=>", ${ethers.formatEther(ap)}`
            );
        }
    }
})();
