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
        SupportNetworks.bscMainnet,
        SupportNetworks.bscTestnet,
        SupportNetworks.forkingBscMainnet,
        SupportNetworks.forkingBscTestnet,
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
    let INIT_OWNER = "0x";
    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet
    ) {
        SOURCE_TOKEN_ADDRESS = "";
        TARGET_TOKEN_ADDRESS = "";
        TREASURY_WALLET = "";
        INIT_OWNER = deployer.address; // admin/deployer wallet address
    } else if (
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingPolygonTestnet
    ) {
        SOURCE_TOKEN_ADDRESS = "0x1b8cbfbdeab06e6e5a3df577beb801ee16ad8c22"; // old IAI token address
        TARGET_TOKEN_ADDRESS = "0x438Ae65CD7CF1cE33279A4De4aB3281b14bdB3B4"; // new VRFI token address
        TREASURY_WALLET = deployer.address; // admin/deployer wallet address
        INIT_OWNER = deployer.address; // admin/deployer wallet address
    } else if (
        targetNetwork === SupportNetworks.bscMainnet ||
        targetNetwork === SupportNetworks.forkingBscMainnet
    ) {
        SOURCE_TOKEN_ADDRESS = "0x1eC58Fe5e681E35e490B5D4cBECdF42B29C1B063"; // old IAI token address
        TARGET_TOKEN_ADDRESS = "0xdDa7Ab46d5139e114A38A1AdAA5d8ca299c87479"; // new VRFI token address
        TREASURY_WALLET = "0x9aFbEaFcC03e8308738e5E6D906a3816994620D5"; // admin/deployer wallet address
        INIT_OWNER = "0xaf6D06B03b609AE796Ae94F724124BADD0AFC053"; // admin/deployer wallet address
    } else if (
        targetNetwork === SupportNetworks.bscTestnet ||
        targetNetwork === SupportNetworks.forkingBscTestnet
    ) {
        SOURCE_TOKEN_ADDRESS = "0xc83E794e8BFFF40F752fb235927908C27306bd42"; // old IAI token address
        TARGET_TOKEN_ADDRESS = "0xa776249E1F1685963258Bbf90501964B20081754"; // new VRFI token address
        TREASURY_WALLET = deployer.address; // admin/deployer wallet address
        INIT_OWNER = deployer.address; // admin/deployer wallet address
    }

    {
        console.log("Source Token:", SOURCE_TOKEN_ADDRESS);
        console.log("Target Token:", TARGET_TOKEN_ADDRESS);
        console.log("Treasury Wallet:", TREASURY_WALLET);
        console.log("Initial Owner:", INIT_OWNER);
        console.log(`--------------------------------------------------`);
    }

    // Migration parameters
    const DEFAULT_MIGRATION_LIMIT = ethers.parseEther("10000000000"); //  10 billion tokens (like no limit)

    console.log(`prechecking ...`);
    const sourceToken = await ethers.getContractAt(
        "ERC20",
        SOURCE_TOKEN_ADDRESS
    );
    const targetToken = await ethers.getContractAt(
        "ERC20",
        TARGET_TOKEN_ADDRESS
    );
    const sourceTokenName = await sourceToken.name();
    const sourceTokenSymbol = await sourceToken.symbol();
    const sourceTokenDecimals = await sourceToken.decimals();
    const targetTokenName = await targetToken.name();
    const targetTokenSymbol = await targetToken.symbol();
    const targetTokenDecimals = await targetToken.decimals();
    console.log(
        `Source Token: ${sourceTokenName} (${sourceTokenSymbol}) - Decimals: ${sourceTokenDecimals}`
    );
    console.log(
        `Target Token: ${targetTokenName} (${targetTokenSymbol}) - Decimals: ${targetTokenDecimals}`
    );
    console.log(`--------------------------------------------------`);
    const confirmed = await cliHelper.confirmPromptMessage(
        "Please confirm the addresses are correct before proceeding."
    );
    if (!confirmed) {
        console.log("Deployment aborted by user.");
        process.exit(1);
    }

    // Deploy TokenMigrater
    const TokenMigrater = await ethers.getContractFactory("TokenMigrater");
    const tokenMigrater = await TokenMigrater.deploy(
        SOURCE_TOKEN_ADDRESS,
        TARGET_TOKEN_ADDRESS,
        TREASURY_WALLET,
        DEFAULT_MIGRATION_LIMIT,
        INIT_OWNER
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
