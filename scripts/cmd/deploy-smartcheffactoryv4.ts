import { ethers } from "hardhat";
import {
    promptSafeChangeNetwork,
    safeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";
import cliHelper from "./cli-helper";
import { SmartChefInitializableV4 } from "../../typechain-types";

async function main() {
    const polygonBlockTime = 2.13; // Average block time in seconds for Polygon
    const targetNetwork = await promptSafeChangeNetwork([
        SupportNetworks.polygonMainnet,
        SupportNetworks.polygonTestnet,
        SupportNetworks.forkingPolygonMainnet,
        SupportNetworks.forkingPolygonTestnet,
    ]);

    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);
    console.log(
        "Account balance:",
        ethers.formatEther(await ethers.provider.getBalance(deployer.address))
    );

    // Farm configuration parameters - these can be adjusted as needed
    let FARM_CONFIG = {
        stakedToken: ethers.ZeroAddress, // IAI Token for staking
        rewardToken: ethers.ZeroAddress, // Reward token (can be same as IAI or different)
        rewardPerBlock: ethers.parseEther("1"), // 1 token per block - ADJUST AS NEEDED
        startBlock: 0n, // Will be set to current block + delay
        endBlock: 0n, // Will be set to startBlock + duration
        poolLimitPerUser: ethers.parseEther("0"), // 0 = no limit - ADJUST AS NEEDED
        lockPeriod: 0n, // 0 blocks = no lock period - ADJUST AS NEEDED
        admin: deployer.address, // Admin address
        blockDuration: 201600n, // ~30 days (assuming 13s per block) - ADJUST AS NEEDED
        blockDelay: 100n, // Start in 100 blocks - ADJUST AS NEEDED
    };
    let totalRewardsNeeded = 0n;

    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet
    ) {
        const IAI_TOKEN_ADDRESS = ethers.ZeroAddress; // Replace with mainnet IAI token address
        const REWARD_TOKEN_ADDRESS = ethers.ZeroAddress; // Replace with mainnet reward token address
        FARM_CONFIG = {
            stakedToken: IAI_TOKEN_ADDRESS,
            rewardToken: REWARD_TOKEN_ADDRESS,
            rewardPerBlock: ethers.parseEther("1"), // Adjust as needed
            startBlock: 0n, // Will be set later
            endBlock: 0n, // Will be set later
            poolLimitPerUser: ethers.parseEther("0"), // No limit by default
            lockPeriod: 0n, // No lock period by default
            admin: deployer.address, // Admin address
            blockDuration: 201600n, // ~30 days (assuming 13s per block)
            blockDelay: 1000n, // Start in 1000 blocks
        };

        const totalBlocks = FARM_CONFIG.endBlock - FARM_CONFIG.startBlock;
        totalRewardsNeeded = totalBlocks * FARM_CONFIG.rewardPerBlock;

        throw new Error(
            "Mainnet deployment is not supported yet. Please use testnet or forked networks for testing."
        );
    } else if (
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingPolygonTestnet
    ) {
        const IAI_TOKEN_ADDRESS = "0x1b8cbfbdeab06e6e5a3df577beb801ee16ad8c22"; // Replace with testnet IAI token address
        const REWARD_TOKEN_ADDRESS =
            "0x1b8cbfbdeab06e6e5a3df577beb801ee16ad8c22"; // Replace with testnet reward token address

        FARM_CONFIG = {
            stakedToken: IAI_TOKEN_ADDRESS,
            rewardToken: REWARD_TOKEN_ADDRESS,
            rewardPerBlock: ethers.parseEther("1"), // Adjust as needed
            startBlock: 0n, // Will be set later
            endBlock: 0n, // Will be set later
            poolLimitPerUser: ethers.parseEther("0"), // No limit by default
            lockPeriod: BigInt(
                Math.floor((30 * 24 * 60 * 60) / polygonBlockTime)
            ), // 30 days
            admin: deployer.address, // Admin address
            blockDuration: BigInt(
                Math.floor((30 * 24 * 60 * 60) / polygonBlockTime)
            ), // ~30 days
            blockDelay: 100n, // Start in 100 blocks
        };

        const currentBlock = await ethers.provider.getBlockNumber();
        FARM_CONFIG.startBlock = BigInt(currentBlock) + FARM_CONFIG.blockDelay;
        FARM_CONFIG.endBlock =
            FARM_CONFIG.startBlock + FARM_CONFIG.blockDuration;

        const totalBlocks = FARM_CONFIG.endBlock - FARM_CONFIG.startBlock;
        totalRewardsNeeded = totalBlocks * FARM_CONFIG.rewardPerBlock;
    }

    if (
        FARM_CONFIG.stakedToken === ethers.ZeroAddress ||
        FARM_CONFIG.rewardToken === ethers.ZeroAddress
    ) {
        throw new Error(
            "Please set the IAI_TOKEN_ADDRESS and REWARD_TOKEN_ADDRESS for mainnet deployment."
        );
    }
    if (
        FARM_CONFIG.startBlock <
        BigInt(await ethers.provider.getBlockNumber()) + FARM_CONFIG.blockDelay
    ) {
        console.warn(
            "Warning: Start block is set to less than 5000 blocks from now. This may cause issues with farm deployment."
        );
    }
    if (FARM_CONFIG.endBlock <= FARM_CONFIG.startBlock) {
        throw new Error(
            "End block must be greater than start block. Please adjust the farm configuration."
        );
    }

    console.log(
        `Total rewards needed for the farm: ${ethers.formatEther(
            totalRewardsNeeded
        )} tokens`
    );
    console.log(`checking reward token balance for ${FARM_CONFIG.admin}...`);
    {
        const rewardToken = await ethers.getContractAt(
            "IERC20",
            FARM_CONFIG.rewardToken
        );
        const rewardTokenBalance = await rewardToken.balanceOf(
            FARM_CONFIG.admin
        );

        if (rewardTokenBalance < totalRewardsNeeded) {
            console.error(
                `Insufficient reward token balance for ${
                    FARM_CONFIG.admin
                }. Required: ${ethers.formatEther(
                    totalRewardsNeeded
                )}, Available: ${ethers.formatEther(rewardTokenBalance)}`
            );
            console.log(
                "\nPlease ensure the admin wallet has enough reward tokens before deploying a farm."
            );
        }
    }

    {
        const confirmed = await cliHelper.confirmPromptMessage(
            "Please confirm the farm configuration is correct before proceeding with deployment."
        );
        if (!confirmed) {
            console.log("Farm deployment aborted by user.");
            return;
        }
    }

    // Deploy SmartChefFactoryV4
    console.log("Deploying SmartChefFactoryV4...");
    {
        const confirmed = await cliHelper.confirmPromptMessage(
            "This will deploy the SmartChefFactoryV4 contract. Please confirm to proceed."
        );
        if (!confirmed) {
            console.log("SmartChefFactoryV4 deployment aborted by user.");
            return;
        }
    }
    const SmartChefFactoryV4 = await ethers.getContractFactory(
        "SmartChefFactoryV4"
    );
    const factoryV4 = await SmartChefFactoryV4.deploy();

    await factoryV4.waitForDeployment();
    const factoryAddress = await factoryV4.getAddress();

    console.log("SmartChefFactoryV4 deployed to:", factoryAddress);
    console.log("Contract owner:", await factoryV4.owner());

    // Calculate total rewards needed
    const totalBlocks = FARM_CONFIG.endBlock - FARM_CONFIG.startBlock;
    totalRewardsNeeded = totalBlocks * FARM_CONFIG.rewardPerBlock;

    console.log("\n=== Farm Configuration ===");
    console.log("Staked Token (IAI):", FARM_CONFIG.stakedToken);
    console.log("Reward Token:", FARM_CONFIG.rewardToken);
    console.log(
        "Reward Per Block:",
        ethers.formatEther(FARM_CONFIG.rewardPerBlock)
    );
    console.log("Start Block:", FARM_CONFIG.startBlock);
    console.log("End Block:", FARM_CONFIG.endBlock);
    console.log("Duration (blocks):", totalBlocks);
    console.log(
        "Pool Limit Per User:",
        ethers.formatEther(FARM_CONFIG.poolLimitPerUser)
    );
    console.log("Lock Period (blocks):", FARM_CONFIG.lockPeriod);
    console.log("Admin:", FARM_CONFIG.admin);
    console.log(
        "Total Rewards Needed:",
        ethers.formatEther(totalRewardsNeeded)
    );

    // Check if token addresses are properly configured
    if (
        !ethers.isAddress(FARM_CONFIG.stakedToken) ||
        !ethers.isAddress(FARM_CONFIG.rewardToken)
    ) {
        console.log("\n⚠️  WARNING: Token addresses are not configured!");
        console.log(
            "Please update the token addresses in the script before deploying a farm."
        );
        console.log("Skipping farm deployment...");

        console.log("\n📝 Next steps:");
        console.log(
            "1. Update IAI_TOKEN_ADDRESS and REWARD_TOKEN_ADDRESS in the script"
        );
        console.log("2. Adjust farm configuration parameters as needed");
        console.log("3. Re-run the script to deploy a farm");
        console.log("4. Consider verifying the contracts on Block explorer");

        return;
    }

    console.log(`approving factory to spend reward tokens...`);
    {
        const rewardToken = await ethers.getContractAt(
            "IERC20",
            FARM_CONFIG.rewardToken
        );
        const approvalTx = await rewardToken.approve(
            factoryAddress,
            totalRewardsNeeded
        );
        await approvalTx.wait();
        console.log(
            `Factory approved to spend ${ethers.formatEther(
                totalRewardsNeeded
            )} reward tokens from ${FARM_CONFIG.admin}`
        );
    }

    // Confirm farm deployment
    const confirmed = await cliHelper.confirmPromptMessage(
        "Please confirm the farm configuration is correct before proceeding with farm deployment."
    );
    if (!confirmed) {
        console.log("Farm deployment aborted by user.");
        console.log("SmartChefFactoryV4 has been deployed successfully.");
        return;
    }

    // Deploy farm
    console.log("\n=== Deploying Farm ===");
    console.log(
        "Note: Make sure you have approved the factory to spend reward tokens!"
    );

    let deployedAddress: string = "";
    let deployedTxHash: string = "";

    try {
        // make static call to pre-check deployPool calling
        console.log("Pre-checking farm deployment with static call...");
        await factoryV4["deployPool"].staticCall(
            FARM_CONFIG.stakedToken,
            FARM_CONFIG.rewardToken,
            FARM_CONFIG.rewardPerBlock,
            FARM_CONFIG.startBlock,
            FARM_CONFIG.endBlock,
            FARM_CONFIG.poolLimitPerUser,
            FARM_CONFIG.lockPeriod,
            FARM_CONFIG.admin
        );
    } catch (error) {
        console.error("Static call failed:", error);
        console.log(
            "\nPossible reasons for static call failure:\n1. Insufficient reward token allowance for the factory\n2. Insufficient reward token balance\n3. Invalid token addresses\n4. Gas limit exceeded"
        );
        console.log(
            "SmartChefFactoryV4 has been deployed successfully to:",
            factoryAddress
        );
        console.log(
            "You can manually deploy a farm later using the factory contract."
        );
        return;
    }

    try {
        // Deploy the farm through the factory
        const tx = await factoryV4.deployPool(
            FARM_CONFIG.stakedToken,
            FARM_CONFIG.rewardToken,
            FARM_CONFIG.rewardPerBlock,
            FARM_CONFIG.startBlock,
            FARM_CONFIG.endBlock,
            FARM_CONFIG.poolLimitPerUser,
            FARM_CONFIG.lockPeriod,
            FARM_CONFIG.admin
        );

        const receipt = await tx.wait();
        console.log("Farm deployment transaction:", tx.hash);

        // Find the NewSmartChefContract event to get the farm address
        const event = receipt?.logs.find((log: any) => {
            try {
                const parsed = factoryV4.interface.parseLog(log);
                return parsed?.name === "NewSmartChefContract";
            } catch {
                return false;
            }
        });

        if (event) {
            const parsed = factoryV4.interface.parseLog(event);
            const farmAddress = parsed?.args[0];
            console.log("Farm deployed to:", farmAddress);

            // Get farm contract instance to verify deployment
            const SmartChefV4 = await ethers.getContractFactory(
                "SmartChefInitializableV4"
            );
            const farm = SmartChefV4.attach(
                farmAddress
            ) as SmartChefInitializableV4;

            console.log("\n=== Farm Verification ===");
            console.log("Farm Address:", farmAddress);
            console.log("Staked Token:", await farm.stakedToken());
            console.log("Reward Token:", await farm.rewardToken());
            console.log(
                "Reward Per Block:",
                ethers.formatEther(await farm.rewardPerBlock())
            );
            console.log("Start Block:", (await farm.startBlock()).toString());
            console.log("End Block:", (await farm.bonusEndBlock()).toString());
            console.log(
                "Pool Limit Per User:",
                ethers.formatEther(await farm.poolLimitPerUser())
            );
            console.log(
                "Lock Period:",
                (await farm.lockingPeriod()).toString()
            );
            console.log("Owner:", await farm.owner());

            deployedAddress = await farm.getAddress();
            deployedTxHash = tx.hash;
        }

        console.log("\n📝 Next steps:");
        console.log(
            "1. Transfer reward tokens to the farm contract if not done automatically"
        );
        console.log("2. Test the farming functionality");
        console.log("3. Consider verifying the contracts on Block explorer");
        console.log("4. Update frontend with new farm address");
    } catch (error) {
        console.error("Failed to deploy farm:", error);
        console.log("\nPossible reasons:");
        console.log("1. Insufficient reward token allowance for the factory");
        console.log("2. Insufficient reward token balance");
        console.log("3. Invalid token addresses");
        console.log("4. Gas limit exceeded");

        console.log(
            "\nSmartChefFactoryV4 has been deployed successfully to:",
            factoryAddress
        );
        console.log(
            "You can manually deploy a farm later using the factory contract."
        );
    }

    // make output dir ...
    const outDir = cliHelper.ensureCommandOutputDirExists("deploy-smartchefv4");

    // write output result ...
    cliHelper.writeOutputResult(
        {
            address: deployedAddress,
            txHash: deployedTxHash,
        },
        outDir,
        "result.json"
    );

    // flatten sol file to output dir ...
    console.log("flattening sol file...");
    await cliHelper.flattenSolidity2File(
        ["../../contracts/SmartChefInitializableV4.sol"],
        outDir,
        "SmartChefInitializableV4.flatten.sol"
    );
    console.log("flattened sol file... done");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
