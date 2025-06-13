import { EtherSymbol, Wallet } from "ethers";
import hre from "hardhat";
import { safeChangeNetwork, SupportNetworks } from "./safe-change-network";
import cliHelper from "./cli-helper";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

(async (): Promise<void> => {
    const { ethers } = hre;
    console.log(`welcome to the playground!`);
    const targetNetwork = SupportNetworks.forkingPolygonMainnet;
    await safeChangeNetwork(targetNetwork);
    const [admin] = await ethers.getSigners();
    console.log(`admin address: ${admin.address}`);
    console.log(
        `admin balance: ${ethers.formatEther(
            await ethers.provider.getBalance(admin.address)
        )}`
    );

    const farmAddr = "0xd02D0a19cC8E280b65C856cD661fac480E5FEd39";
    const iaiTokenAddr = "0x418a89B177b41e24FA50712a1822F6e6E8C629A1";

    const iaiToken = await ethers.getContractAt("IAIToken", iaiTokenAddr);

    const farmOwner = await ethers.getImpersonatedSigner(
        "0x01e118be20f9e347F91f333fE42Fd571964C3544"
    );
    const farmOwnerBalance = await ethers.provider.getBalance(
        farmOwner.address
    );
    console.log(
        `farm owner address: ${
            farmOwner.address
        }, balance: ${ethers.formatEther(farmOwnerBalance)}`
    );

    const depositingUsers = [
        "0x4E0A6e9027f2A6bc3C6d5bbeD8A295c2A95c21fa",
        "0xd743996a5301A18223e629227Db17bb09A62298f",
    ];

    console.log(`--------------------------------`);
    const farm = await ethers.getContractAt("SmartChefInitializable", farmAddr);
    for (const user of depositingUsers) {
        const userInfo = await farm.userInfo(user);
        const pendingReward = await farm.pendingReward(user);
        console.log(
            `user: ${user}, amount: ${ethers.formatEther(
                userInfo.amount
            )}, pendingReward: ${ethers.formatEther(pendingReward)}`
        );
    }
    console.log(`--------------------------------`);

    console.log(`stopping reward...`);
    const tx = await farm.connect(farmOwner).stopReward();
    const stopRewardReceipt = await tx.wait();
    if (stopRewardReceipt?.status !== 1) {
        console.error("Failed to stop reward");
        process.exit(1);
    }
    console.log(`reward stopped successfully`);
    console.log(`--------------------------------`);

    console.log(`checking pending rewards...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const pendingReward = await farm
            .connect(userSigner)
            .pendingReward(user);
        console.log(
            `user: ${user}, pendingReward: ${ethers.formatEther(pendingReward)}`
        );
    }
    console.log(`--------------------------------`);

    console.log(`simulate block mining...`);
    {
        const bn = await ethers.provider.getBlockNumber();
        const blockCount = 100;
        console.log(
            `current block number: ${bn} will mine ${blockCount} blocks`
        );
        await mine(blockCount);
        const newBn = await ethers.provider.getBlockNumber();
        console.log(`now block number: ${newBn}`);
    }
    console.log(`--------------------------------`);

    console.log(`checking pending rewards after mining...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const pendingReward = await farm
            .connect(userSigner)
            .pendingReward(user);
        console.log(
            `user: ${user}, pendingReward: ${ethers.formatEther(pendingReward)}`
        );
    }
    console.log(`--------------------------------`);

    console.log(`simulating user claim reward...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const balanceBefore = await iaiToken.balanceOf(user);

        const claimTx = await farm.connect(userSigner).deposit(0);
        const claimReceipt = await claimTx.wait();
        if (claimReceipt?.status !== 1) {
            console.error(`Failed to claim reward for user ${user}`);
            continue;
        }
        const balanceAfter = await iaiToken.balanceOf(user);
        const claimedAmount = balanceAfter - balanceBefore;
        console.log(
            `user: ${user}, claimed amount: ${ethers.formatEther(
                claimedAmount
            )}`
        );

        const pendingReward = await farm.pendingReward(user);
        console.log(
            `user: ${user}, pendingReward after claim: ${ethers.formatEther(
                pendingReward
            )}`
        );
        console.log(`--------------------------------`);
    }

    console.log(`simulate block mining again...`);
    {
        const bn = await ethers.provider.getBlockNumber();
        const blockCount = 100;
        console.log(
            `current block number: ${bn} will mine ${blockCount} blocks`
        );
        await mine(blockCount);
        const newBn = await ethers.provider.getBlockNumber();
        console.log(`now block number: ${newBn}`);
    }
    console.log(`--------------------------------`);

    console.log(`simulate user withdraw...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const userInfo = await farm.userInfo(user);
        const depositAmount = userInfo.amount;
        const balanceBefore = await iaiToken.balanceOf(user);

        console.log(
            `user: ${user}, deposit amount: ${ethers.formatEther(
                depositAmount
            )}, will withdraw total: ${ethers.formatEther(depositAmount)} IAI`
        );

        const withdrawTx = await farm
            .connect(userSigner)
            .withdraw(depositAmount);
        const withdrawReceipt = await withdrawTx.wait();
        if (withdrawReceipt?.status !== 1) {
            console.error(`Failed to withdraw for user ${user}`);
            continue;
        }
        const depositAmountAfter = (await farm.userInfo(user)).amount;
        console.log(
            `user: ${user}, deposit amount after withdraw: ${ethers.formatEther(
                depositAmountAfter
            )}`
        );
        const balanceAfter = await iaiToken.balanceOf(user);
        console.log(
            `user: ${user}, balance before withdraw: ${ethers.formatEther(
                balanceBefore
            )}, balance after withdraw: ${ethers.formatEther(
                balanceAfter
            )}, withdraw amount: ${ethers.formatEther(
                balanceAfter - balanceBefore
            )}`
        );
        console.log(`--------------------------------`);
    }

    console.log(`simulate block mining...`);
    {
        const bn = await ethers.provider.getBlockNumber();
        const blockCount = 100;
        console.log(
            `current block number: ${bn} will mine ${blockCount} blocks`
        );
        await mine(blockCount);
        const newBn = await ethers.provider.getBlockNumber();
        console.log(`now block number: ${newBn}`);
    }
    console.log(`--------------------------------`);

    console.log(`simulate user deposit...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const depositAmount = ethers.parseEther("5");
        const balanceBefore = await iaiToken.balanceOf(user);

        console.log(
            `user: ${user}, deposit amount: ${ethers.formatEther(
                depositAmount
            )}, will deposit total: ${ethers.formatEther(depositAmount)} IAI`
        );

        const approveTx = await iaiToken
            .connect(userSigner)
            .approve(farmAddr, depositAmount);
        await approveTx.wait();

        const depositTx = await farm.connect(userSigner).deposit(depositAmount);
        const depositReceipt = await depositTx.wait();
        if (depositReceipt?.status !== 1) {
            console.error(`Failed to deposit for user ${user}`);
            continue;
        }
        const depositAmountAfter = (await farm.userInfo(user)).amount;
        console.log(
            `user: ${user}, deposit amount after deposit: ${ethers.formatEther(
                depositAmountAfter
            )}`
        );
        const balanceAfter = await iaiToken.balanceOf(user);
        console.log(
            `user: ${user}, balance before deposit: ${ethers.formatEther(
                balanceBefore
            )}, balance after deposit: ${ethers.formatEther(
                balanceAfter
            )}, deposited amount: ${ethers.formatEther(
                balanceBefore - balanceAfter
            )}`
        );
        console.log(`--------------------------------`);
    }

    console.log(`simulate block mining...`);
    {
        const bn = await ethers.provider.getBlockNumber();
        const blockCount = 100;
        console.log(
            `current block number: ${bn} will mine ${blockCount} blocks`
        );
        await mine(blockCount);
        const newBn = await ethers.provider.getBlockNumber();
        console.log(`now block number: ${newBn}`);
    }
    console.log(`--------------------------------`);

    console.log(`checking pending rewards after mining...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const pendingReward = await farm
            .connect(userSigner)
            .pendingReward(user);
        console.log(
            `user: ${user}, pendingReward: ${ethers.formatEther(pendingReward)}`
        );
    }
    console.log(`--------------------------------`);

    console.log(`simulate user withdraw and finish testing...`);
    for (const user of depositingUsers) {
        const userSigner = await ethers.getImpersonatedSigner(user);
        const userInfo = await farm.userInfo(user);
        const depositAmount = userInfo.amount;
        const balanceBefore = await iaiToken.balanceOf(user);

        console.log(
            `user: ${user}, deposit amount: ${ethers.formatEther(
                depositAmount
            )}, will withdraw total: ${ethers.formatEther(depositAmount)} IAI`
        );

        const withdrawTx = await farm
            .connect(userSigner)
            .withdraw(depositAmount);
        const withdrawReceipt = await withdrawTx.wait();
        if (withdrawReceipt?.status !== 1) {
            console.error(`Failed to withdraw for user ${user}`);
            continue;
        }
        const depositAmountAfter = (await farm.userInfo(user)).amount;
        console.log(
            `user: ${user}, deposit amount after withdraw: ${ethers.formatEther(
                depositAmountAfter
            )}`
        );
        const balanceAfter = await iaiToken.balanceOf(user);
        console.log(
            `user: ${user}, balance before withdraw: ${ethers.formatEther(
                balanceBefore
            )}, balance after withdraw: ${ethers.formatEther(
                balanceAfter
            )}, withdraw amount: ${ethers.formatEther(
                balanceAfter - balanceBefore
            )}`
        );
        console.log(`--------------------------------`);
    }

    console.log(`simulate owner fo emergencyRewardWithdraw...`);
    {
        const balanceBefore = await iaiToken.balanceOf(farmOwner.address);
        console.log(
            `farm owner: ${
                farmOwner.address
            }, balance before emergency withdraw: ${ethers.formatEther(
                balanceBefore
            )}`
        );
        const withdrawAmount = ethers.parseEther("1000");
        console.log(
            `will emergency withdraw: ${ethers.formatEther(withdrawAmount)}`
        );

        const emergencyWithdrawTx = await farm
            .connect(farmOwner)
            .emergencyRewardWithdraw(withdrawAmount);
        const emergencyWithdrawReceipt = await emergencyWithdrawTx.wait();
        if (emergencyWithdrawReceipt?.status !== 1) {
            console.error(`Failed to emergency withdraw`);
            process.exit(1);
        }

        const balanceAfter = await iaiToken.balanceOf(farmOwner.address);
        console.log(
            `farm owner: ${
                farmOwner.address
            }, balance after emergency withdraw: ${ethers.formatEther(
                balanceAfter
            )}, withdrawn amount: ${ethers.formatEther(
                balanceAfter - balanceBefore
            )}`
        );
    }
    console.log(`--------------------------------`);
})();
