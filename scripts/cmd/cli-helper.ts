import prompts from "prompts";
import * as fs from "fs";
import * as path from "path";
import * as hre from "hardhat";
import { HardhatRuntimeEnvironment, HttpNetworkConfig } from "hardhat/types";

/**
 * confirmEnvConfigs ...
 * @returns true if all information is confirmed
 */
async function confirmEnvConfig(hre: HardhatRuntimeEnvironment) {
    console.log("please review chain network config...");
    console.log("configure name:", hre.network.name);
    const cfg: HttpNetworkConfig = hre.network.config as HttpNetworkConfig;
    console.log("network RPC url:", cfg.url);
    console.log("network RPC chain ID:", cfg.chainId);
    console.log("with transactor address:", cfg.from);
    if (
        cfg.accounts &&
        cfg.accounts instanceof Array &&
        cfg.accounts.length > 0
    ) {
        console.log(
            "and its private key:",
            cfg.accounts[0].substring(0, 6).concat("...")
        );
    } else {
        console.log("without specific private key!");
    }

    return await confirmPromptMessage("confirm to continue?");
}

async function confirmPromptMessage(msg: string) {
    const resp = await prompts({
        type: "confirm",
        name: "confirm",
        message: msg,
        initial: false,
    });
    return resp.confirm;
}

async function promptForPrivateKey(msg: string): Promise<string> {
    const response = await prompts({
        type: "password",
        name: "privateKey",
        message: msg,
    });
    const pk = response.privateKey as string;
    console.log(
        "please confirm your private key:",
        [pk.slice(0, 4), "****", pk.slice(pk.length - 4, pk.length)].join()
    );
    return pk;
}

function writeHLine(char = "=", length = 100) {
    console.log(char.repeat(length));
}

function ensureDirExists(dirPath: string) {
    // make sure out dir exists
    const exists = fs.existsSync(dirPath);
    if (!exists) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (err) {
            console.error("failed to make dir:", dirPath, "due to error:", err);
            return;
        }
    }
    console.log("created directory:", dirPath);
}

/**
 *
 * @param {string} cmdName
 * @param {Array} parentFolderPath
 * @returns
 */
function ensureCommandOutputDirExists(
    cmdName: string,
    parentFolderPath: [string] | undefined = undefined
) {
    let dirPath = path.join(".", "out");
    if (parentFolderPath && Array.isArray(parentFolderPath)) {
        dirPath = path.join(dirPath, ...parentFolderPath);
    }
    dirPath = path.join(dirPath, cmdName, `${+new Date()}-${hre.network.name}`);

    // make sure out dir exists
    const exists = fs.existsSync(dirPath);
    if (!exists) {
        try {
            fs.mkdirSync(dirPath, { recursive: true });
        } catch (err) {
            console.error("failed to make dir:", dirPath, "due to error:", err);
            return;
        }
    }
    console.log("created directory:", dirPath);
    return dirPath;
}

function writeOutputResult(
    result: {} | string,
    dstOutDir: string,
    resultFileName: string
) {
    const fs = require("fs");
    const path = require("path");
    const resultFilePath = path.join(
        dstOutDir,
        resultFileName ?? "result.json"
    );
    try {
        fs.writeFileSync(
            resultFilePath,
            typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2)
        );
    } catch (Error) {
        console.log("failed to write output to file");
        return;
    }

    console.log(`write result file ${resultFilePath} ...done`);
}

/**
 *
 * @param {string} inputFilePath file path to input JSON
 */
function validateCmdInputFile(inputFilePath: string, exampleInput = {}) {
    if (fs.existsSync(inputFilePath)) {
        return true;
    }

    console.log(
        `input JSON file at ${inputFilePath} does not exist, please create input.json with content...`
    );
    console.log(JSON.stringify(exampleInput));
    return false;
}

function saveInputToOutDir(input: any, dstOutDir: string) {
    const inputFilePath = path.join(dstOutDir, "input.json");
    try {
        fs.writeFileSync(inputFilePath, JSON.stringify(input, null, 2));
    } catch (Error) {
        console.log("failed to write input to file");
        return;
    }

    console.log(`write input file ${inputFilePath} ...done`);
}

function JSONStringify(obj: any) {
    return JSON.stringify(
        obj,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
    );
}

async function flattenSolidity2File(
    contractFilePath: string[],
    dstOutDir: string,
    flattenFileName: string
) {
    await hre.run("flatten2", {
        files: contractFilePath,
        out: path.join(dstOutDir, flattenFileName),
    });
}

export default {
    confirmEnvConfig,
    confirmPromptMessage,
    promptForPrivateKey,
    ensureDirExists,
    ensureCommandOutputDirExists,
    writeHLine,
    validateCmdInputFile,
    writeOutputResult,

    saveInputToOutDir,
    JSONStringify,
    flattenSolidity2File,
};
