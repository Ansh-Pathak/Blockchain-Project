const { ethers } = require("hardhat");
const { CONTRACT_ADDRESSES } = require("./_load-addresses.js");

/**
 * Run this AFTER deploy-all.js, against the same local network, to
 * pre-populate realistic demo data. This way, when you open the frontend
 * live in front of your teacher, there's already a registered patient, an
 * approved therapist, a completed session, and a DAO proposal to show -
 * you don't have to click through the entire setup flow live and risk a
 * mistake or slow moment during grading.
 *
 * Usage:
 *   npx hardhat run scripts/deploy-all.js --network localhost
 *   npx hardhat run scripts/demo-seed.js --network localhost
 */
async function main() {
  const [admin, patient, therapist] = await ethers.getSigners();

  const therapistRegistry = await ethers.getContractAt("TherapistRegistry", CONTRACT_ADDRESSES.TherapistRegistry);
  const patientRegistry = await ethers.getContractAt("PatientRegistry", CONTRACT_ADDRESSES.PatientRegistry);
  const rewardToken = await ethers.getContractAt("RewardToken", CONTRACT_ADDRESSES.RewardToken);
  const sessionEscrow = await ethers.getContractAt("SessionEscrow", CONTRACT_ADDRESSES.SessionEscrow);
  const governance = await ethers.getContractAt("MindChainGovernance", CONTRACT_ADDRESSES.MindChainGovernance);

  console.log("Seeding demo data...");
  console.log("Admin:     ", admin.address);
  console.log("Patient:   ", patient.address, "(import this into MetaMask to demo as the patient)");
  console.log("Therapist: ", therapist.address, "(import this into MetaMask to demo as the therapist)");

  // Therapist applies and gets approved
  const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("Dr. Demo - Licensed Clinical Therapist"));
  await (await therapistRegistry.connect(therapist).applyAsTherapist(credentialHash)).wait();
  await (await therapistRegistry.connect(admin).approveTherapist(therapist.address)).wait();
  console.log("Therapist applied and approved.");

  // Patient registers and logs two journal entries
  await (await patientRegistry.connect(patient).registerAsPatient()).wait();
  await (await patientRegistry.connect(patient).logJournalEntry(
    ethers.keccak256(ethers.toUtf8Bytes("First entry: feeling anxious about exams."))
  )).wait();
  await (await patientRegistry.connect(patient).logJournalEntry(
    ethers.keccak256(ethers.toUtf8Bytes("Second entry: session helped, feeling calmer."))
  )).wait();
  console.log("Patient registered with 2 journal entries logged.");

  // One completed session (booked + confirmed), so a reward already exists
  const fee = ethers.parseEther("0.02");
  await (await sessionEscrow.connect(patient).bookSession(therapist.address, { value: fee })).wait();
  await (await sessionEscrow.connect(therapist).confirmSession(0)).wait();
  console.log("Session #0 booked and completed. Therapist earned MIND tokens.");

  // One more session left pending (Requested), so the demo can show the
  // confirm/cancel buttons live instead of everything already being done
  await (await sessionEscrow.connect(patient).bookSession(therapist.address, { value: fee })).wait();
  console.log("Session #1 booked and left pending - confirm/cancel it live in the demo.");

  // A DAO proposal, already created and voted on by the therapist, so the
  // governance panel isn't empty (still Active - can be finalized live once its 3-day window would end, or just shown as "Active" during the demo)
  await (await governance.connect(therapist).createProposal(
    "Reduce standard session fee from 0.02 ETH to 0.015 ETH to make sessions more accessible"
  )).wait();
  await (await governance.connect(therapist).vote(0, true)).wait();
  console.log("DAO proposal #0 created and voted on by the therapist.");

  console.log("\nDemo data seeded successfully. Start the frontend with `npm run dev` in the frontend/ folder.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
