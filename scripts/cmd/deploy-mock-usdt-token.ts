import { ethers } from "hardhat";
import {
    promptSafeChangeNetwork,
    SupportNetworks,
} from "./safe-change-network";

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
    if (!targetNetwork) {
        console.error("No network selected. Exiting...");
        process.exit(1);
    }
    console.log(`changed network to: ${targetNetwork} ...`);

    // Hardcoded USDT-like token settings
    const name = "Mocking Tether USD";
    const symbol = "MOCKUSDT";
    let decimals = 6;

    if (
        targetNetwork === SupportNetworks.polygonMainnet ||
        targetNetwork === SupportNetworks.forkingPolygonMainnet ||
        targetNetwork === SupportNetworks.polygonTestnet ||
        targetNetwork === SupportNetworks.forkingPolygonTestnet
    ) {
        decimals = 6; // Polygon Mainnet USDT has 6 decimals
    } else if (
        targetNetwork === SupportNetworks.bscMainnet ||
        targetNetwork === SupportNetworks.forkingBscMainnet ||
        targetNetwork === SupportNetworks.bscTestnet ||
        targetNetwork === SupportNetworks.forkingBscTestnet
    ) {
        decimals = 18; // Polygon Testnet USDT has 18 decimals
    } else {
        console.error("Unsupported network for Mock USDT deployment.");
        process.exit(1);
    }

    const initialSupply = ethers.parseUnits("1000000000", decimals); // 1,000,000,000 USDT

    const [deployer] = await ethers.getSigners();
    console.log("Deploying Mock USDT with account:", deployer.address);
    const balance = await deployer.provider!.getBalance(deployer.address);
    console.log("Deployer balance:", ethers.formatEther(balance));

    // Deploy MockERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUSDT = await MockERC20.deploy(
        name,
        symbol,
        decimals,
        initialSupply
    );
    await mockUSDT.waitForDeployment();
    const mockUSDTAddress = await mockUSDT.getAddress();
    console.log(`MockUSDT deployed to: ${mockUSDTAddress}`);
    console.log(
        `Deployment tx hash: ${mockUSDT.deploymentTransaction()?.hash}`
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
