import "@nomicfoundation/hardhat-toolbox";

import dotenv from "dotenv";
import { ethers } from "ethers";
import { HardhatUserConfig } from "hardhat/config";

dotenv.config();
console.log(
  "started forking node rpc:",
  process.env.FORKING_RPC_URL,
  "chainID:",
  process.env.FORKING_CHAIN_ID
);

/**
 * @type import('hardhat/config').HardhatUserConfig
 */

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      forking: {
        url: process.env.FORKING_RPC_URL!,
      },
      chainId: parseInt(process.env.FORKING_CHAIN_ID!),
      from: process.env.WALLET_ADDRESS,
      accounts: [
        ...(process.env.PRIVATE_KEY
          ? [
              // NOTE: chanyutl - find accounts field document in https://hardhat.org/hardhat-network/reference/#accounts
              {
                privateKey: process.env.PRIVATE_KEY,
                balance: ethers
                  .parseEther(process.env.ETH_BALANCE || "1000000")
                  .toString(), // mimic balance
              },
            ]
          : []),
      ],
    },
  },
  solidity: {
    compilers: [
      {
        version: "0.8.24",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200, // the more runs number the bigger byte code size
          },
        },
      },
    ],
  },
};

export default config;
