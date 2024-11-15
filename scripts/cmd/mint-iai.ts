import { ethers } from "hardhat";
import hre from "hardhat";
import cliHelper from "./cli-helper";

(async (): Promise<void> => {
    const networks = ["ethereumTestnet", "polygonTestnet", "bscTestnet"];
    const iAITokenAddress = "";

    const IAIToken = await hre.ethers.getContractFactory("IAIToken");
    for (const network of networks) {
        await hre.changeNetwork(network);
        const adminWallet = await hre.ethers.provider.getSigner();
        const adminWalletAddress = await adminWallet.getAddress();
        const iAIToken = await hre.ethers.getContractAt(
            "IAIToken",
            iAITokenAddress
        );
        const balance = await iAIToken.balanceOf(adminWalletAddress);
        console.log(
            `>> ${network} admin address: ${adminWalletAddress} ${ethers.formatEther(
                balance
            )}`
        );

        const confirmed = await cliHelper.confirmPromptMessage(
            `mint more IAI Token to ${adminWalletAddress}`
        );

        if (confirmed) {
            const mintAmount = "1000000";
            console.log(
                `start minting ${mintAmount} IAIToken to admin wallet ...`
            );
            const tx = await iAIToken.mint(
                adminWalletAddress,
                ethers.parseEther(mintAmount)
            );
            const receipt = await tx.wait();
            console.log(
                `>> ${network} minted ${mintAmount} IAIToken to ${adminWalletAddress} with tx: ${tx.hash} status: ${receipt?.status}`
            );
        }
    }
})();
