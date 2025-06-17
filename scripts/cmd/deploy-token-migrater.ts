import { ethers } from "hardhat";
import {
    promptSafeChangeNetwork,
    safeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";
import cliHelper from "./cli-helper";

async function main() {
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
        (await ethers.provider.getBalance(deployer.address)).toString()
    );

    // Contract addresses (replace with actual deployed addresses)
    let SOURCE_TOKEN_ADDRESS = "0x..."; // Replace with actual source token address (IAI)
    let TARGET_TOKEN_ADDRESS = "0x..."; // Replace with actual target token address (VRFI)
    let TREASURY_WALLET = "0x..."; // Replace with actual treasury wallet address
    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet
    ) {
        SOURCE_TOKEN_ADDRESS = "";
        TARGET_TOKEN_ADDRESS = "";
        TREASURY_WALLET = "";
    } else if (
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingPolygonTestnet
    ) {
        SOURCE_TOKEN_ADDRESS = "";
        TARGET_TOKEN_ADDRESS = "";
        TREASURY_WALLET = "";
    }

    {
        console.log("Source Token:", SOURCE_TOKEN_ADDRESS);
        console.log("Target Token:", TARGET_TOKEN_ADDRESS);
        console.log("Treasury Wallet:", TREASURY_WALLET);
        const confirmed = await cliHelper.confirmPromptMessage(
            "Please confirm the addresses are correct before proceeding."
        );
        if (!confirmed) {
            console.log("Deployment aborted by user.");
            process.exit(1);
        }
        console.log(`--------------------------------------------------`);
    }

    // Migration parameters
    const DEFAULT_MIGRATION_LIMIT = ethers.parseEther("10000000000"); //  10 billion tokens

    // Deploy TokenMigrater
    const TokenMigrater = await ethers.getContractFactory("TokenMigrater");
    const tokenMigrater = await TokenMigrater.deploy(
        SOURCE_TOKEN_ADDRESS,
        TARGET_TOKEN_ADDRESS,
        TREASURY_WALLET,
        DEFAULT_MIGRATION_LIMIT,
        deployer.address
    );

    await tokenMigrater.waitForDeployment();

    console.log("TokenMigrater deployed to:", await tokenMigrater.getAddress());
    console.log(`Contract owner:`, await tokenMigrater.owner());
    console.log("Source Token (IAI):", await tokenMigrater.sourceToken());
    console.log("Target Token (VRFI):", await tokenMigrater.targetToken());
    console.log("Treasury Wallet:", await tokenMigrater.treasuryWallet());
    console.log(
        "Default Migration Limit:",
        ethers.formatEther(DEFAULT_MIGRATION_LIMIT)
    );

    // Verify deployment
    const contractInfo = await tokenMigrater.getContractInfo();
    console.log("\nContract Info:");
    console.log("- Migration Paused:", contractInfo.isPaused);
    console.log(
        "- Target Token Balance:",
        ethers.formatEther(contractInfo.targetBalance)
    );
    console.log(
        "- Default Limit:",
        ethers.formatEther(contractInfo.defaultLimit)
    );
    console.log("- Treasury:", contractInfo.treasury);

    console.log("\n📝 Next steps:");
    console.log("1. Transfer target tokens to the migrator contract");
    console.log("2. Adjust the default migration limit if needed");
    console.log("3. Test the migration functionality");
    console.log("4. Consider verifying the contract on Block explorer");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
