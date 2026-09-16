// Paste the addresses printed by `npx hardhat run scripts/deploy-all.js`
// here every time you redeploy (addresses change on every fresh deployment
// to a local network; they stay fixed once deployed to Sepolia).
export const CONTRACT_ADDRESSES = {
  TherapistRegistry: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  PatientRegistry: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  RewardToken: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  SessionEscrow: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  MindChainGovernance: "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707",
};

// The network the frontend expects MetaMask to be connected to.
// Local Hardhat node = 1337 (see hardhat.config.js). Sepolia = 11155111.
export const EXPECTED_CHAIN_ID = 1337;
