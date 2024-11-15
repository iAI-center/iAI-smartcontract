import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import "./hardhat-change-network";
import "./task/flatten2";

import networkPolygonTestnet from "./.networks/polygonTestnet.json";
import { N } from "ethers";

const config: HardhatUserConfig = {
    solidity: "0.8.27",
    networks: {
        hardhat: {},
        polygonTestnet: {
            ...networkPolygonTestnet,
        },
        forkingPolygonTestnet: {
            ...networkPolygonTestnet,
            url: "http://127.0.0.1:8545",
        },
    },
};

export default config;
