import { ethers } from "hardhat";
import { safeChangeNetwork, SupportNetworks } from "../cmd/safe-change-network";
import cliHelper from "../cmd/cli-helper";
import { setBalance } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { Wallet } from "ethers";

async function main() {
    const supportNetwork = SupportNetworks.forkingBscMainnet;
    await safeChangeNetwork(supportNetwork);
    console.log(`Switched to network: ${supportNetwork}`);

    const [admin] = await ethers.getSigners();
    console.log(`Admin address: ${admin.address}`);
    console.log(
        `Admin balance: ${ethers.formatEther(
            await ethers.provider.getBalance(admin.address)
        )} ETH`
    );

    const vrfiToken = await ethers.getContractAt(
        "VRFIToken",
        "0xdDa7Ab46d5139e114A38A1AdAA5d8ca299c87479"
    );
    const tokenMigrator = await ethers.getContractAt(
        "TokenMigrater",
        "0x71b731a8198BAeEF01f8596770970f8Aecb3eC7D"
    );
    const jkToken = await ethers.getContractAt(
        "ERC20",
        await tokenMigrator.sourceToken()
    );
    const jkHolder = "0xCe6CE4c6DC6D32a3C07Bc2176dDbE89D80c9d49b";

    const migratorOwnerAddr = await tokenMigrator.owner();
    const vrfiTokenOwnerAddr = await vrfiToken.owner();

    const vrfiOwner = await ethers.getImpersonatedSigner(vrfiTokenOwnerAddr);
    const migratorOwner = await ethers.getImpersonatedSigner(migratorOwnerAddr);
    const jkHolderSigner = await ethers.getImpersonatedSigner(jkHolder);

    // set native token enough for execute transactions ...
    {
        await setBalance(migratorOwnerAddr, ethers.parseEther("100"));
        await setBalance(vrfiOwner.address, ethers.parseEther("100"));
        await setBalance(jkHolder, ethers.parseEther("100"));
    }

    // verify balances of related accounts
    const showAllBalances = async (header: string) => {
        const holderYKBalance = await jkToken.balanceOf(jkHolder);
        const vrfiBalance = await vrfiToken.balanceOf(jkHolder);
        const treasuryYKHolderBalance = await jkToken.balanceOf(
            await tokenMigrator.treasuryWallet()
        );
        const migratorVRFIBalance = await vrfiToken.balanceOf(
            await tokenMigrator.getAddress()
        );
        console.log(`------------------------------`);
        console.log(header);
        console.log(`------------------------------`);
        console.log(
            `YKHolder's JK balance: ${ethers.formatEther(holderYKBalance)} JK`
        );
        console.log(
            `YKHolder's VRFI balance: ${ethers.formatEther(vrfiBalance)} VRFI`
        );
        console.log(
            `Treasury JK balance: ${ethers.formatEther(
                treasuryYKHolderBalance
            )} JK`
        );
        console.log(
            `Migrator's VRFI balance: ${ethers.formatEther(
                migratorVRFIBalance
            )} VRFI`
        );
        console.log(`------------------------------`);
    };

    await showAllBalances(`before migration ...`);

    // vrfiOwner transfer VRFI to migrator
    const initialMigrationFund = ethers.parseEther("1000000");
    console.log(
        `VRFI Token Owner: ${vrfiTokenOwnerAddr} will transfer VRFI to migrator`
    );
    {
        const vrfiBalance = await vrfiToken.balanceOf(
            tokenMigrator.getAddress()
        );
        if (vrfiBalance === 0n) {
            console.log(
                `Migrator has no VRFI tokens, transferring ${ethers.formatEther(
                    initialMigrationFund
                )}...`
            );
            const transferAmount = initialMigrationFund;
            const tx = await vrfiToken
                .connect(vrfiOwner)
                .transfer(tokenMigrator.getAddress(), transferAmount);
            const receipt = await tx.wait();
            console.log(
                `Transferred ${ethers.formatEther(
                    transferAmount
                )} VRFI to migrator`
            );
            if (receipt?.status !== 1) {
                throw new Error("Transaction failed");
            }
        } else {
            console.log(
                `Migrator already has ${ethers.formatEther(
                    vrfiBalance
                )} VRFI tokens`
            );
        }
    }

    const migratingAmount = ethers.parseEther("199");
    // approve
    console.log(
        `YKHolder Approving ${ethers.formatEther(
            migratingAmount
        )} JK tokens for migration`
    );
    {
        const tx = await jkToken
            .connect(jkHolderSigner)
            .approve(tokenMigrator.getAddress(), migratingAmount);
        const receipt = await tx.wait();
        console.log(
            `Approved ${ethers.formatEther(
                migratingAmount
            )} JK tokens for migration`
        );
        if (receipt?.status !== 1) {
            throw new Error("Transaction failed");
        }
    }

    // migrate
    {
        const tx = await tokenMigrator
            .connect(jkHolderSigner)
            .migrate(migratingAmount);
        const receipt = await tx.wait();
        console.log(
            `Migrated ${ethers.formatEther(migratingAmount)} JK tokens to VRFI`
        );
        if (receipt?.status !== 1) {
            throw new Error("Transaction failed");
        }
    }

    await showAllBalances(`after migration ...`);

    // check migration info
    {
        const contractInfo = await tokenMigrator.getContractInfo();
        console.log(
            `Migration Info: Paused: ${
                contractInfo.isPaused
            }, Target Balance: ${ethers.formatEther(
                contractInfo.targetBalance
            )} VRFI, Default Limit: ${ethers.formatEther(
                contractInfo.defaultLimit
            )} VRFI, Treasury: ${contractInfo.treasury}`
        );
    }

    // pause migration
    {
        const isPaused = await tokenMigrator.migrationPaused();
        if (!isPaused) {
            console.log(`Pausing migration...`);
            const tx = await tokenMigrator
                .connect(migratorOwner)
                .pauseMigration(true);
            const receipt = await tx.wait();
            console.log(`Migration paused`);
            if (receipt?.status !== 1) {
                throw new Error("Transaction failed");
            }
        } else {
            console.log(`Migration is already paused`);
        }
    }

    // try to migrate, it should fail
    {
        try {
            const tx = await tokenMigrator
                .connect(jkHolderSigner)
                .migrate(migratingAmount);
            const receipt = await tx.wait();
            console.log(
                `Migrated ${ethers.formatEther(
                    migratingAmount
                )} JK tokens to VRFI`
            );
            if (receipt?.status === 1) {
                throw new Error("Transaction must be failed (but it success)");
            }
        } catch (error) {
            console.log(`transaction should be reverted with error: ${error}`);
        }
    }

    // unpause and allow to migrate
    {
        const isPaused = await tokenMigrator.migrationPaused();
        if (isPaused) {
            console.log(`Pausing migration...`);
            const tx = await tokenMigrator
                .connect(migratorOwner)
                .pauseMigration(false);
            const receipt = await tx.wait();
            console.log(`Migration unpaused`);
            if (receipt?.status !== 1) {
                throw new Error("Transaction failed");
            }
        } else {
            console.log(`Migration is already unpaused`);
        }

        await showAllBalances("before migrate ...");

        {
            const canMigrate = await tokenMigrator.canMigrate(
                jkHolderSigner.address,
                migratingAmount
            );
            if (!canMigrate) {
                throw new Error(
                    `Migration is not allowed for ${jkHolderSigner.address}`
                );
            }
            const approveTx = await jkToken
                .connect(jkHolderSigner)
                .approve(tokenMigrator.getAddress(), migratingAmount);
            const approveReceipt = await approveTx.wait();
            if (approveReceipt?.status !== 1) {
                throw new Error(`'Transaction must be success (but it failed)`);
            }
            console.log(
                `Approved ${ethers.formatEther(
                    migratingAmount
                )} JK tokens for migration`
            );

            const migrateTx = await tokenMigrator
                .connect(jkHolderSigner)
                .migrate(migratingAmount);
            const migrateReceipt = await migrateTx.wait();
            console.log(
                `Migrated ${ethers.formatEther(
                    migratingAmount
                )} JK tokens to VRFI`
            );
            if (migrateReceipt?.status !== 1) {
                throw new Error(`'Transaction must be success (but it failed)`);
            }
        }

        await showAllBalances("after migrated ...");
    }

    // allow to change treasury wallet
    const newTreasuryWallet = Wallet.createRandom();
    {
        const tx = await tokenMigrator
            .connect(migratorOwner)
            .setTreasuryWallet(newTreasuryWallet.address);
        const receipt = await tx.wait();
        if (!receipt?.status) {
            throw new Error(`transactoin failed`);
        }

        const migratorTreasuryWalletAddr = await tokenMigrator.treasuryWallet();
        console.log(
            `new token migrator's treasury wallet: ${migratorTreasuryWalletAddr}`
        );
        if ((await migratorTreasuryWalletAddr) !== newTreasuryWallet.address) {
            throw new Error(`Treasury wallet was not changed`);
        }
    }

    // after change treasury wallet, try migrate ...
    {
        await showAllBalances(
            `before migration after change treasury wallet ...`
        );

        const approveTx = await jkToken
            .connect(jkHolderSigner)
            .approve(tokenMigrator.getAddress(), migratingAmount);
        const approveReceipt = await approveTx.wait();
        console.log(
            `Approved ${ethers.formatEther(
                migratingAmount
            )} JK tokens for migration`
        );
        if (approveReceipt?.status !== 1) {
            throw new Error(`'Transaction must be success (but it failed)`);
        }

        const migrateTx = await tokenMigrator
            .connect(jkHolderSigner)
            .migrate(migratingAmount);
        const migrateReceipt = await migrateTx.wait();
        console.log(
            `Migrated ${ethers.formatEther(migratingAmount)} JK tokens to VRFI`
        );
        if (migrateReceipt?.status !== 1) {
            throw new Error(`'Transaction must be success (but it failed)`);
        }

        await showAllBalances(
            `after migration after change treasury wallet ...`
        );
    }

    // simulate user has not enough JK tokens to migrate
    {
        const userAddr = "0x69EC2020320f8829A81f32688d07baAf39115baD";
        const userSigner = await ethers.getImpersonatedSigner(userAddr);
        const userJKBalance = await jkToken.balanceOf(userAddr);
        console.log(
            `User ${userAddr} JK balance: ${ethers.formatEther(
                userJKBalance
            )} JK`
        );

        await setBalance(userAddr, ethers.parseEther("100"));

        const userMigratingAmount = userJKBalance + 1n; // more than user's balance
        console.log(
            `User ${userAddr} trying to migrate ${ethers.formatEther(
                userMigratingAmount
            )} JK tokens`
        );
        const canMigrate = await tokenMigrator.canMigrate(
            userAddr,
            userMigratingAmount
        );
        if (canMigrate) {
            console.log(
                `User ${userAddr} can migrate ${ethers.formatEther(
                    userMigratingAmount
                )} JK tokens`
            );
        } else {
            console.log(
                `User ${userAddr} cannot migrate ${ethers.formatEther(
                    userMigratingAmount
                )} JK tokens`
            );
        }

        {
            const tx = await jkToken
                .connect(userSigner)
                .approve(tokenMigrator.getAddress(), userMigratingAmount);
            const receipt = await tx.wait();
            console.log(
                `User ${userAddr} approved ${ethers.formatEther(
                    userMigratingAmount
                )} JK tokens for migration`
            );
            if (receipt?.status !== 1) {
                throw new Error(`Transaction must be success (but it failed)`);
            }
        }

        try {
            const tx = await tokenMigrator
                .connect(userSigner)
                .migrate(userMigratingAmount);
            const receipt = await tx.wait();
            console.log(
                `User ${userAddr} migrated ${ethers.formatEther(
                    userMigratingAmount
                )} JK tokens to VRFI`
            );
            if (receipt?.status === 1) {
                throw new Error(`Transaction must be failed (but it success)`);
            }
        } catch (error) {
            console.log(
                `User ${userAddr} migration transaction should be reverted with error: ${error}`
            );
        }
    }

    // test emergency withdraw
    {
        const ownerVRFIBalanceBeforeWithdraw = await vrfiToken.balanceOf(
            vrfiOwner.address
        );
        console.log(
            `VRFI Owner balance before emergency withdraw: ${ethers.formatEther(
                ownerVRFIBalanceBeforeWithdraw
            )} VRFI`
        );
        const migratorVRFIBalance = await vrfiToken.balanceOf(
            await tokenMigrator.getAddress()
        );
        console.log(
            `Migrator VRFI balance before emergency withdraw: ${ethers.formatEther(
                migratorVRFIBalance
            )} VRFI`
        );

        const tx = await tokenMigrator
            .connect(migratorOwner)
            .emergencyWithdraw(
                await vrfiToken.getAddress(),
                migratorVRFIBalance,
                vrfiOwner.address
            );
        const receipt = await tx.wait();
        console.log(
            `Emergency withdrew ${ethers.formatEther(
                migratorVRFIBalance
            )} VRFI to ${vrfiOwner.address}`
        );
        if (receipt?.status !== 1) {
            throw new Error("Transaction failed");
        }

        const migratorVRFIBalanceAfter = await vrfiToken.balanceOf(
            await tokenMigrator.getAddress()
        );
        console.log(
            `Migrator VRFI balance after emergency withdraw: ${ethers.formatEther(
                migratorVRFIBalanceAfter
            )} VRFI`
        );

        const ownerVRFIBalanceAfterWithdraw = await vrfiToken.balanceOf(
            vrfiOwner.address
        );
        console.log(
            `VRFI Owner balance after emergency withdraw: ${ethers.formatEther(
                ownerVRFIBalanceAfterWithdraw
            )} VRFI`
        );
    }

    // after withdraw all VRFI tokens from migrator, user could not be able to migrate
    {
        const canMigrate = await tokenMigrator.canMigrate(
            jkHolderSigner.address,
            migratingAmount
        );
        if (canMigrate) {
            throw new Error(
                `Migration is not allowed for ${jkHolderSigner.address}`
            );
        }
        const approveTx = await jkToken
            .connect(jkHolderSigner)
            .approve(tokenMigrator.getAddress(), migratingAmount);
        const approveReceipt = await approveTx.wait();
        if (approveReceipt?.status !== 1) {
            throw new Error(`'Transaction must be success (but it failed)`);
        }
        console.log(
            `Approved ${ethers.formatEther(
                migratingAmount
            )} JK tokens for migration`
        );

        try {
            await tokenMigrator
                .connect(jkHolderSigner)
                .migrate(migratingAmount);
        } catch (error) {
            console.log(
                `Migration transaction should be reverted with error: ${error}`
            );
        }
    }
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
