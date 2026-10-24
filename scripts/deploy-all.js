const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying all MindChain DAO contracts with account:", deployer.address);
  console.log("Account balance:", (await ethers.provider.getBalance(deployer.address)).toString());

  // 1. TherapistRegistry - no dependencies
  const TherapistRegistry = await ethers.getContractFactory("TherapistRegistry");
  const therapistRegistry = await TherapistRegistry.deploy();
  await therapistRegistry.waitForDeployment();
  console.log("TherapistRegistry deployed to:", await therapistRegistry.getAddress());

  // 2. PatientRegistry - no dependencies
  const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
  const patientRegistry = await PatientRegistry.deploy();
  await patientRegistry.waitForDeployment();
  console.log("PatientRegistry deployed to:", await patientRegistry.getAddress());

  // 3. RewardToken - no dependencies yet (minter is set after SessionEscrow exists)
  const RewardToken = await ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardToken.deploy();
  await rewardToken.waitForDeployment();
  console.log("RewardToken deployed to:", await rewardToken.getAddress());

  // 4. SessionEscrow - depends on TherapistRegistry + RewardToken addresses
  const SessionEscrow = await ethers.getContractFactory("SessionEscrow");
  const sessionEscrow = await SessionEscrow.deploy(
    await therapistRegistry.getAddress(),
    await rewardToken.getAddress()
  );
  await sessionEscrow.waitForDeployment();
  console.log("SessionEscrow deployed to:", await sessionEscrow.getAddress());

  // 5. Wire RewardToken's minter to SessionEscrow, so only real completed sessions mint rewards
  const setMinterTx = await rewardToken.setMinter(await sessionEscrow.getAddress());
  await setMinterTx.wait();
  console.log("RewardToken minter set to SessionEscrow");

  // 6. MindChainGovernance - depends on RewardToken address (used as voting weight)
  const Governance = await ethers.getContractFactory("MindChainGovernance");
  const governance = await Governance.deploy(await rewardToken.getAddress());
  await governance.waitForDeployment();
  console.log("MindChainGovernance deployed to:", await governance.getAddress());

  // 7. SemaphoreVerifier - the ZK proof verifier used by Semaphore
  const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
  const semaphoreVerifier = await SemaphoreVerifier.deploy();
  await semaphoreVerifier.waitForDeployment();
  console.log("SemaphoreVerifier deployed to:", await semaphoreVerifier.getAddress());

  // 8. PoseidonT3 - external hash library required by Semaphore's LeanIMT Merkle tree
  const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
  const poseidonT3 = await PoseidonT3.deploy();
  await poseidonT3.waitForDeployment();
  console.log("PoseidonT3 deployed to:", await poseidonT3.getAddress());

  // 9. Semaphore - the core protocol contract (linked to PoseidonT3)
  const Semaphore = await ethers.getContractFactory("Semaphore", {
    libraries: {
      PoseidonT3: await poseidonT3.getAddress(),
    },
  });
  const semaphore = await Semaphore.deploy(await semaphoreVerifier.getAddress());
  await semaphore.waitForDeployment();
  console.log("Semaphore deployed to:", await semaphore.getAddress());

  // 9. AnonymousPatientRegistry - uses Semaphore for ZK group membership + PatientRegistry as sybil gate
  const AnonymousPatientRegistry = await ethers.getContractFactory("AnonymousPatientRegistry");
  const anonymousPatientRegistry = await AnonymousPatientRegistry.deploy(
    await semaphore.getAddress(),
    await patientRegistry.getAddress()
  );
  await anonymousPatientRegistry.waitForDeployment();
  console.log("AnonymousPatientRegistry deployed to:", await anonymousPatientRegistry.getAddress());

  console.log("\n--- Deployment summary ---");
  const addresses = {
    TherapistRegistry: await therapistRegistry.getAddress(),
    PatientRegistry: await patientRegistry.getAddress(),
    RewardToken: await rewardToken.getAddress(),
    SessionEscrow: await sessionEscrow.getAddress(),
    MindChainGovernance: await governance.getAddress(),
    SemaphoreVerifier: await semaphoreVerifier.getAddress(),
    Semaphore: await semaphore.getAddress(),
    AnonymousPatientRegistry: await anonymousPatientRegistry.getAddress(),
  };
  console.log(addresses);

  // Write addresses to a shared JSON file so other scripts (demo-seed.js)
  // and the frontend can both read the same source of truth instead of
  // having addresses duplicated and potentially out of sync in multiple files.
  const outputPath = path.join(__dirname, "..", "deployed-addresses.json");
  fs.writeFileSync(outputPath, JSON.stringify(addresses, null, 2));
  console.log(`\nAddresses written to ${outputPath}`);
  console.log("Remember to also update frontend/src/contracts/addresses.js if these changed.");

  // ── Optional: Transfer TherapistRegistry admin to Governance ──
  // This makes the DAO the sole authority for approving therapists.
  // Run this AFTER demo-seed.js so the seed script can still approve
  // therapists directly using the deployer's admin role.
  //
  // Uncomment the next 3 lines to transfer admin immediately:
  // const transferTx = await therapistRegistry.transferAdmin(await governance.getAddress());
  // await transferTx.wait();
  // console.log("TherapistRegistry admin transferred to MindChainGovernance");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
