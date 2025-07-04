import { ethers } from "hardhat";
import { safeChangeNetwork, SupportNetworks } from "../cmd/safe-change-network";
import cliHelper from "../cmd/cli-helper";

async function main() {
    const supportNetwork = SupportNetworks.polygonTestnet;
    await safeChangeNetwork(supportNetwork);
    console.log(`Switched to network: ${supportNetwork}`);

    const [admin] = await ethers.getSigners();
    console.log(`Admin address: ${admin.address}`);
    console.log(
        `Admin balance: ${ethers.formatEther(
            await ethers.provider.getBalance(admin.address)
        )} ETH`
    );

    const usdt = await ethers.getContractAt(
        "ERC20",
        "0x4E1610F4104e541B202eD8040a97e44245BB1Bd6"
    );
    const presale = await ethers.getContractAt(
        "VRFIPresale",
        "0x53DE40Eb9cE5c0d983ee5Aa849e62cE506c080b5"
    );
    const vrfiPresaleToken = await ethers.getContractAt(
        "VRFIPresaleToken",
        "0x481a5636d9738f691f08c6f8dAc8117742C664C1"
    );

    const usdtBalance = await usdt.balanceOf(admin.address);
    const usdtDecimals = await usdt.decimals();
    const presaleTokenBalance = await vrfiPresaleToken.balanceOf(admin.address);
    console.log(
        `USDT balance: ${ethers.formatUnits(usdtBalance, usdtDecimals)} USDT`
    );
    console.log(
        `VRFI Presale Token balance: ${ethers.formatEther(
            presaleTokenBalance
        )} VRFI Presale`
    );

    {
        const confirmed = await cliHelper.confirmPromptMessage("continue?");
        if (!confirmed) {
            console.log("Operation cancelled by user.");
            return;
        }
    }

    console.log("checking presale whitelist ...");
    {
        const isWhitelisted = await presale.isWhitelisted(admin.address);
        if (!isWhitelisted) {
            console.log("You are not whitelisted for the presale.");

            const tx = await presale.addToWhitelist(
                admin.address,
                ethers.parseUnits("10000000", usdtDecimals)
            );
            console.log(`Whitelist transaction hash: ${tx.hash}`);
            await tx.wait();
        }
        console.log("You are whitelisted for the presale.");
    }

    {
        const confirmed = await cliHelper.confirmPromptMessage("continue?");
        if (!confirmed) {
            console.log("Operation cancelled by user.");
            return;
        }
    }

    const approveTx = await usdt
        .connect(admin)
        .approve(
            await presale.getAddress(),
            ethers.parseUnits("2", usdtDecimals)
        );
    console.log(`Approve transaction hash: ${approveTx.hash}`);
    await approveTx.wait();
    console.log("USDT approved for presale");

    const buyTx = await presale
        .connect(admin)
        .buyTokens(ethers.parseUnits("2", usdtDecimals));
    console.log(`Buy transaction hash: ${buyTx.hash}`);
    await buyTx.wait();
    console.log("Tokens purchased successfully");

    const newUsdtBalance = await usdt.balanceOf(admin.address);
    const newPresaleTokenBalance = await vrfiPresaleToken.balanceOf(
        admin.address
    );
    console.log(
        `New USDT balance: ${ethers.formatUnits(
            newUsdtBalance,
            usdtDecimals
        )} USDT`
    );
    console.log(
        `New VRFI Presale Token balance: ${ethers.formatEther(
            newPresaleTokenBalance
        )} VRFI Presale`
    );
}

main()
    .then(() => {
        console.log("Script executed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Error executing script:", error);
        process.exit(1);
    });
