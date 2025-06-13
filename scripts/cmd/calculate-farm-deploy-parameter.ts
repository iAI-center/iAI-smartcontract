import { Command } from "commander";
import cliHelper from "./cli-helper";
import { ethers } from "hardhat";
import * as hre from "hardhat";
import * as path from "path";
import * as fs from "fs";

(async (): Promise<void> => {
    const blockTimeInSec = 2n;
    const totalReward = ethers.parseEther("33000000"); // 33M IAI Tokens
    const totalBlocks = 31536000n;
    const rewardPerBlock = totalReward / totalBlocks;

    console.log(
        `rewardPerBlock: ${rewardPerBlock} => ${ethers.formatEther(
            rewardPerBlock
        )}`
    );

    const totalDistributingRewards = totalBlocks * rewardPerBlock;
    if (totalDistributingRewards !== totalReward) {
        console.log(
            `totalDistributingRewards: ${totalDistributingRewards} => ${ethers.formatEther(
                totalDistributingRewards
            )}`
        );
        const rewardDiff = totalReward - totalDistributingRewards;
        console.log(
            `reward diff: ${rewardDiff} => ${ethers.formatEther(rewardDiff)}`
        );

        const adjustTotalBlocks = totalBlocks + 1n;
        const totalRewardRequired = adjustTotalBlocks * rewardPerBlock;
        console.log(
            `totalRewardRequired: ${totalRewardRequired} => ${ethers.formatEther(
                totalRewardRequired
            )}`
        );
    }
})();
