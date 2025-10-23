import { EtherSymbol, Wallet } from "ethers";
import hre from "hardhat";
import { safeChangeNetwork, SupportNetworks } from "./safe-change-network";
import cliHelper from "./cli-helper";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

(async (): Promise<void> => {
    const { ethers } = hre;
    console.log(`welcome to the playground!`);
    const targetNetwork = SupportNetworks.forkingBscTestnet;
    await safeChangeNetwork(targetNetwork);
    const admin = await ethers.getImpersonatedSigner(
        "0x8ac5Ed65A272B0Ce945c379fb20466CA2b3BbE57"
    );
    const presaleAddress = "0x4Ac009c4A567E7fEE19C35C5D72779Cca09f90d5";

    const adminAddress = await admin.getAddress();
    console.log(`admin address: ${adminAddress}`);

    const presaleContract = await ethers.getContractAt(
        "GREENPresale",
        presaleAddress,
        admin
    );
    console.log(`presale contract address: ${presaleAddress}`);

    const price = await presaleContract.tokenPrice();
    console.log(`token price: ${ethers.formatEther(price)} BNB`);

    const usdtTokenAddress = await presaleContract.usdtToken();
    console.log(`USDT token address: ${usdtTokenAddress}`);
    const usdtToken = await ethers.getContractAt(
        "IERC20",
        usdtTokenAddress,
        admin
    );
    const usdtBalance = await usdtToken.balanceOf(adminAddress);
    console.log(
        `admin USDT balance: ${ethers.formatUnits(usdtBalance, 18)} USDT`
    );

    const allowance = await usdtToken.allowance(adminAddress, presaleAddress);
    console.log(
        `admin allowance to presale: ${ethers.formatUnits(allowance, 18)} USDT`
    );

    // await usdtToken.approve(presaleAddress, ethers.parseUnits("1000", 18));

    console.log(`simulating buyTokens call...`);
    await presaleContract.buyTokens.staticCall(price);
})();
