const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * This test is different from the per-contract unit tests elsewhere in
 * test/. Instead of testing one contract's functions in isolation, it plays
 * out the complete real-world story end to end, across all 5 contracts,
 * the same way a real user session would happen through the frontend:
 *
 *   Admin deploys everything
 *     -> Therapist applies, admin approves
 *     -> Patient registers, logs a journal entry
 *     -> Patient books a session with the therapist (pays into escrow)
 *     -> Therapist confirms the session (gets paid + earns MIND tokens)
 *     -> Therapist (now a token holder) creates a DAO proposal
 *     -> Patient and therapist vote
 *     -> Voting period ends, proposal is finalized
 *
 * If this test passes, it's strong evidence the whole system actually works
 * together, not just each piece in isolation.
 */
describe("MindChain DAO — end-to-end lifecycle", function () {
  it("plays out a full patient -> therapist -> session -> governance flow", async function () {
    const [admin, patient, therapist] = await ethers.getSigners();

    // --- Deploy all 5 contracts, wired together exactly like deploy-all.js ---
    const TherapistRegistry = await ethers.getContractFactory("TherapistRegistry");
    const therapistRegistry = await TherapistRegistry.connect(admin).deploy();
    await therapistRegistry.waitForDeployment();

    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    const patientRegistry = await PatientRegistry.deploy();
    await patientRegistry.waitForDeployment();

    const RewardToken = await ethers.getContractFactory("RewardToken");
    const rewardToken = await RewardToken.connect(admin).deploy();
    await rewardToken.waitForDeployment();

    const SessionEscrow = await ethers.getContractFactory("SessionEscrow");
    const sessionEscrow = await SessionEscrow.deploy(
      await therapistRegistry.getAddress(),
      await rewardToken.getAddress()
    );
    await sessionEscrow.waitForDeployment();

    await rewardToken.connect(admin).setMinter(await sessionEscrow.getAddress());

    const Governance = await ethers.getContractFactory("MindChainGovernance");
    const governance = await Governance.deploy(await rewardToken.getAddress());
    await governance.waitForDeployment();

    // --- Step 1: Therapist applies, admin approves (Day 2 modules) ---
    const credentialHash = ethers.keccak256(ethers.toUtf8Bytes("licensed-therapist-credentials"));
    await therapistRegistry.connect(therapist).applyAsTherapist(credentialHash);
    await therapistRegistry.connect(admin).approveTherapist(therapist.address);
    expect(await therapistRegistry.isApprovedTherapist(therapist.address)).to.equal(true);

    // --- Step 2: Patient registers and logs a journal entry (Day 2 module) ---
    await patientRegistry.connect(patient).registerAsPatient();
    const journalHash = ethers.keccak256(ethers.toUtf8Bytes("Today I felt a bit better than yesterday."));
    await patientRegistry.connect(patient).logJournalEntry(journalHash);
    expect(await patientRegistry.getJournalEntryCount(patient.address)).to.equal(1);

    // --- Step 3: Patient books a session, paying into escrow (Day 3 module) ---
    const sessionFee = ethers.parseEther("0.02");
    await sessionEscrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

    const escrowAddress = await sessionEscrow.getAddress();
    expect(await ethers.provider.getBalance(escrowAddress)).to.equal(sessionFee);

    // --- Step 4: Therapist confirms the session - gets paid + earns MIND tokens (Day 3 module) ---
    const therapistBalanceBefore = await ethers.provider.getBalance(therapist.address);
    await sessionEscrow.connect(therapist).confirmSession(0);
    const therapistBalanceAfter = await ethers.provider.getBalance(therapist.address);

    expect(therapistBalanceAfter).to.be.greaterThan(therapistBalanceBefore);
    expect(await rewardToken.balanceOf(therapist.address)).to.equal(ethers.parseEther("10"));
    expect(await ethers.provider.getBalance(escrowAddress)).to.equal(0);

    // --- Step 5: Therapist, now a MIND token holder, creates a DAO proposal (Day 4 module) ---
    await governance.connect(therapist).createProposal("Reduce standard session fee to encourage more bookings");
    const proposal = await governance.proposals(0);
    expect(proposal.proposer).to.equal(therapist.address);

    // --- Step 6: Therapist votes for their own proposal ---
    await governance.connect(therapist).vote(0, true);

    // Patient has no MIND tokens yet, so they cannot vote - this is
    // expected and correct behavior, not a bug: voting weight is earned
    // through completed sessions, not given away for free.
    await expect(governance.connect(patient).vote(0, true))
      .to.be.revertedWith("Governance: must hold MIND tokens to vote");

    // --- Step 7: Voting period ends, proposal is finalized ---
    await time.increase(3 * 24 * 60 * 60 + 1);
    await governance.finalizeProposal(0);

    const finalProposal = await governance.proposals(0);
    expect(finalProposal.state).to.equal(1); // 1 = Passed (therapist's 10 MIND tokens voted for, 0 against)
    expect(finalProposal.votesFor).to.equal(ethers.parseEther("10"));
  });
});
