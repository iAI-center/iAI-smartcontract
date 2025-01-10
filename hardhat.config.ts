import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "./hardhat-change-network";
import "./task/flatten2";

import networkPolygonTestnet from "./.networks/polygonTestnet.json";
import networkBscTestnet from "./.networks/bscTestnet.json";

const SOLC_0_8_27_NO_OPTIMIZER = {
    version: "0.8.27",
    settings: {
        optimizer: {
            enabled: false,
            runs: 200,
        },
    },
};

const config: HardhatUserConfig = {
    // solidity: "0.8.27",
    solidity: {
        version: "0.8.27",
        settings: {
            optimizer: {
                enabled: false,
                runs: 200,
            },
        },
        overrides: {
            "contracts/CallHelper.sol": SOLC_0_8_27_NO_OPTIMIZER,
            "contracts/IAI.sol": SOLC_0_8_27_NO_OPTIMIZER,
            "contracts/RewardDistributor.sol": SOLC_0_8_27_NO_OPTIMIZER,
        },
    },
    networks: {
        hardhat: {},
        polygonTestnet: {
            ...networkPolygonTestnet,
        },
        forkingPolygonTestnet: {
            ...networkPolygonTestnet,
            url: "http://127.0.0.1:8545",
        },
        bscTestnet: {
            ...networkBscTestnet,
        },
        forkingBscTestnet: {
            ...networkBscTestnet,
            url: "http://127.0.0.1:8545",
        },
    },
};

export default config;
