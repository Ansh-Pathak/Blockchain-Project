require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// These come from a .env file that is NOT committed to git (see .gitignore).
// SEPOLIA_RPC_URL: get a free one from https://www.alchemy.com/ or https://infura.io/
// PRIVATE_KEY: your MetaMask test wallet's private key (use a wallet with ONLY test ETH, never real funds)
// ETHERSCAN_API_KEY: free key from https://etherscan.io/apis (used to verify contracts)
const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    // Local in-memory blockchain, spins up instantly, resets every run.
    // Great for writing and testing contracts fast, before spending testnet ETH.
    hardhat: {
      chainId: 1337,
    },
    // Ethereum public testnet - this is what you'll actually deploy to for the demo,
    // so your teacher can view the contracts on Sepolia Etherscan.
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
};
