const { ethers } = require("hardhat");

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

  console.log("\n--- Deployment summary ---");
  console.log({
    TherapistRegistry: await therapistRegistry.getAddress(),
    PatientRegistry: await patientRegistry.getAddress(),
    RewardToken: await rewardToken.getAddress(),
    SessionEscrow: await sessionEscrow.getAddress(),
    MindChainGovernance: await governance.getAddress(),
  });
  console.log("\nSave these addresses - the frontend (Day 5-6) will need them.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
