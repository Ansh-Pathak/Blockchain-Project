// Paste the addresses printed by `npx hardhat run scripts/deploy-all.js`
// here every time you redeploy (addresses change on every fresh deployment
// to a local network; they stay fixed once deployed to Sepolia).
export const CONTRACT_ADDRESSES = {
  TherapistRegistry: '0x825085e80A56c661EB016bc14C8888d58bABb9Ac',
  PatientRegistry: '0x252387Ff7AE2156003510f3d9398E99280776102',
  RewardToken: '0x3d493410AfB5A281d20aC8EeCD2A076F669c8e42',
  SessionEscrow: '0xc4d0Ef93777d85dC1822FDb4C204eD1D98109756',
  MindChainGovernance: '0x4f33cE3b4E2E1e656b737C8B7121e8F1bAE9601F',
  SemaphoreVerifier: '0xB0F32224e7E1F30043e95Aa30BC1623ade982227',
  Semaphore: '0xa15c6Fe2e485b5aE06A050B29915E60BB24c6c24',
  AnonymousPatientRegistry: '0x333ABe2fDe6A42Cd2b5E4b55D3C2508Fda84AFC6'
};

// The network the frontend expects MetaMask to be connected to.
// Local Hardhat node = 1337 (see hardhat.config.js). Sepolia = 11155111.
export const EXPECTED_CHAIN_ID = 11155111;
