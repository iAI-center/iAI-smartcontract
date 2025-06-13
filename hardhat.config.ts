import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "hardhat-switch-network";
import "./task/flatten2";

import networkPolygonTestnet from "./.networks/polygonTestnet.json";
import networkBscTestnet from "./.networks/bscTestnet.json";
import networkPolygonMainnet from "./.networks/polygonMainnet.json";
import networkBscMainnet from "./.networks/bscMainnet.json";
import networkBaseMainnet from "./.networks/baseMainnet.json";
import { HardhatNetworkUserConfig } from "hardhat/types";

import "hardhat-contract-sizer";

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
            "contracts/IAIPresale.sol": SOLC_0_8_27_NO_OPTIMIZER,
            "contracts/IAIPresaleV2.sol": SOLC_0_8_27_NO_OPTIMIZER,
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
        } as HardhatNetworkUserConfig,
        bscTestnet: {
            ...networkBscTestnet,
        },
        forkingBscTestnet: {
            ...networkBscTestnet,
            url: "http://127.0.0.1:8545",
        },
        polygonMainnet: {
            ...networkPolygonMainnet,
        },
        forkingPolygonMainnet: {
            url: "http://127.0.0.1:8545",
        } as HardhatNetworkUserConfig,
        bscMainnet: {
            ...networkBscMainnet,
        },
        forkingBscMainnet: {
            ...networkBscMainnet,
            url: "http://127.0.0.1:8545",
        },
        baseMainnet: {
            ...networkBaseMainnet,
        },
        forkingBaseMainnet: {
            ...networkBaseMainnet,
            url: "http://127.0.0.1:8545",
        },
    },

    // contractSizer for reporting compiled contract size...
    contractSizer: {
        alphaSort: false,
        runOnCompile: true,
        disambiguatePaths: false,
    },
};

export default config;
