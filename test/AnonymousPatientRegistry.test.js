const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * AnonymousPatientRegistry tests — verifying that ZK anonymous identity
 * works correctly on-chain.
 *
 * NOTE ON ZK PROOF TESTING: Generating real ZK proofs in a Hardhat test
 * environment requires the @semaphore-protocol/proof library (ES module +
 * WASM). We use dynamic import() to load it since Hardhat uses CommonJS.
 * The proof generation takes a few seconds — this is normal.
 */
describe("AnonymousPatientRegistry", function () {
  // Increase timeout since ZK proof generation is CPU-intensive
  this.timeout(120_000);

  let deployer, patient, stranger;
  let patientRegistry, semaphore, semaphoreVerifier, anonymousPatientRegistry;

  beforeEach(async function () {
    [deployer, patient, stranger] = await ethers.getSigners();

    // Deploy PatientRegistry (the existing sybil gate)
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    patientRegistry = await PatientRegistry.deploy();
    await patientRegistry.waitForDeployment();

    // Deploy Semaphore stack
    const SemaphoreVerifier = await ethers.getContractFactory("SemaphoreVerifier");
    semaphoreVerifier = await SemaphoreVerifier.deploy();
    await semaphoreVerifier.waitForDeployment();

    // PoseidonT3 is an external library used by Semaphore's LeanIMT Merkle tree.
    // It must be deployed separately and linked to the Semaphore contract.
    const PoseidonT3 = await ethers.getContractFactory("PoseidonT3");
    const poseidonT3 = await PoseidonT3.deploy();
    await poseidonT3.waitForDeployment();

    const Semaphore = await ethers.getContractFactory("Semaphore", {
      libraries: {
        PoseidonT3: await poseidonT3.getAddress(),
      },
    });
    semaphore = await Semaphore.deploy(await semaphoreVerifier.getAddress());
    await semaphore.waitForDeployment();

    // Deploy AnonymousPatientRegistry
    const AnonymousPatientRegistry = await ethers.getContractFactory("AnonymousPatientRegistry");
    anonymousPatientRegistry = await AnonymousPatientRegistry.deploy(
      await semaphore.getAddress(),
      await patientRegistry.getAddress()
    );
    await anonymousPatientRegistry.waitForDeployment();

    // Register the patient in the normal PatientRegistry (prerequisite for going anonymous)
    await patientRegistry.connect(patient).registerAsPatient();
  });

  describe("joinAnonymousGroup", function () {
    it("allows a registered patient to join with a valid identity commitment", async function () {
      // Dynamically import the ES module
      const { Identity } = await import("@semaphore-protocol/identity");

      const identity = new Identity();
      const commitment = identity.commitment;

      await expect(
        anonymousPatientRegistry.connect(patient).joinAnonymousGroup(commitment)
      )
        .to.emit(anonymousPatientRegistry, "PatientJoinedGroup")
        .withArgs(patient.address, commitment);

      expect(await anonymousPatientRegistry.hasJoinedGroup(patient.address)).to.equal(true);
    });

    it("rejects a wallet that is not a registered patient", async function () {
      const { Identity } = await import("@semaphore-protocol/identity");

      const identity = new Identity();

      await expect(
        anonymousPatientRegistry.connect(stranger).joinAnonymousGroup(identity.commitment)
      ).to.be.revertedWith("AnonymousPatientRegistry: must be a registered patient");
    });

    it("rejects a patient who has already joined the group", async function () {
      const { Identity } = await import("@semaphore-protocol/identity");

      const identity = new Identity();
      await anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity.commitment);

      const identity2 = new Identity();
      await expect(
        anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity2.commitment)
      ).to.be.revertedWith("AnonymousPatientRegistry: already joined the anonymous group");
    });
  });

  describe("logAnonymousJournal — with real ZK proofs", function () {
    it("accepts a valid ZK proof and stores the content hash", async function () {
      // 1. Create identity and join the on-chain group
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");

      const identity = new Identity();
      await anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity.commitment);

      // 2. Build the client-side group mirror (must match the on-chain Merkle tree)
      const group = new Group();
      group.addMember(identity.commitment);

      // 3. Prepare the journal entry
      const journalText = "Today I felt more hopeful about recovery.";
      const contentHash = ethers.keccak256(ethers.toUtf8Bytes(journalText));
      const contentHashUint = BigInt(contentHash);

      // 4. Generate the ZK proof
      // Both message AND scope are set to contentHashUint because the contract
      // requires proof.scope == uint256(contentHash). Using contentHash as scope
      // means each journal entry gets its own nullifier domain — same patient can
      // submit multiple entries (different scope = different nullifier) but cannot
      // submit the SAME entry twice (same scope = same nullifier).
      const proof = await generateProof(identity, group, contentHashUint, contentHashUint);

      // 5. Submit the anonymous journal entry
      const semaphoreProof = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      };

      await expect(
        anonymousPatientRegistry.connect(deployer).logAnonymousJournal(contentHash, semaphoreProof)
      )
        .to.emit(anonymousPatientRegistry, "AnonymousJournalLogged")
        .withArgs(contentHash, proof.nullifier, (ts) => ts > 0);

      // 6. Verify storage
      expect(await anonymousPatientRegistry.getAnonymousJournalCount()).to.equal(1);
      expect(await anonymousPatientRegistry.getAnonymousJournalHash(0)).to.equal(contentHash);
    });

    it("rejects a proof with the same nullifier (no double-signaling)", async function () {
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");

      const identity = new Identity();
      await anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity.commitment);

      const group = new Group();
      group.addMember(identity.commitment);

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Entry 1"));
      const contentHashUint = BigInt(contentHash);

      // scope = contentHashUint to match the contract's requirement
      const proof = await generateProof(identity, group, contentHashUint, contentHashUint);

      const semaphoreProof = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      };

      // First submission succeeds
      await anonymousPatientRegistry.logAnonymousJournal(contentHash, semaphoreProof);

      // Second submission with the same proof (same nullifier) should fail
      await expect(
        anonymousPatientRegistry.logAnonymousJournal(contentHash, semaphoreProof)
      ).to.be.reverted; // Semaphore reverts with Semaphore__YouAreUsingTheSameNullifierTwice
    });

    it("rejects a proof where message doesn't match contentHash", async function () {
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");

      const identity = new Identity();
      await anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity.commitment);

      const group = new Group();
      group.addMember(identity.commitment);

      const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Real entry"));
      const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("Fake entry"));

      // Generate proof for the real content hash (scope = contentHash to match contract)
      const proof = await generateProof(identity, group, BigInt(contentHash), BigInt(contentHash));

      const semaphoreProof = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      };

      // Try to submit with a DIFFERENT content hash than what the proof was generated for
      await expect(
        anonymousPatientRegistry.logAnonymousJournal(fakeHash, semaphoreProof)
      ).to.be.revertedWith("AnonymousPatientRegistry: proof message must match contentHash");
    });

    it("can submit multiple journal entries with different messages", async function () {
      const { Identity } = await import("@semaphore-protocol/identity");
      const { Group } = await import("@semaphore-protocol/group");
      const { generateProof } = await import("@semaphore-protocol/proof");

      const identity = new Identity();
      await anonymousPatientRegistry.connect(patient).joinAnonymousGroup(identity.commitment);

      const group = new Group();
      group.addMember(identity.commitment);

      // Entry 1 — scope = contentHash so each entry gets its own nullifier domain
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("Journal entry 1"));
      const proof1 = await generateProof(identity, group, BigInt(hash1), BigInt(hash1));
      await anonymousPatientRegistry.logAnonymousJournal(hash1, {
        merkleTreeDepth: proof1.merkleTreeDepth,
        merkleTreeRoot: proof1.merkleTreeRoot,
        nullifier: proof1.nullifier,
        message: proof1.message,
        scope: proof1.scope,
        points: proof1.points,
      });

      // Entry 2 (different message = different nullifier, so it should work)
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("Journal entry 2"));
      const proof2 = await generateProof(identity, group, BigInt(hash2), BigInt(hash2));
      await anonymousPatientRegistry.logAnonymousJournal(hash2, {
        merkleTreeDepth: proof2.merkleTreeDepth,
        merkleTreeRoot: proof2.merkleTreeRoot,
        nullifier: proof2.nullifier,
        message: proof2.message,
        scope: proof2.scope,
        points: proof2.points,
      });

      expect(await anonymousPatientRegistry.getAnonymousJournalCount()).to.equal(2);
      expect(await anonymousPatientRegistry.getAnonymousJournalHash(0)).to.equal(hash1);
      expect(await anonymousPatientRegistry.getAnonymousJournalHash(1)).to.equal(hash2);
    });
  });

  describe("view functions", function () {
    it("getAnonymousJournalCount returns 0 when no entries exist", async function () {
      expect(await anonymousPatientRegistry.getAnonymousJournalCount()).to.equal(0);
    });
  });
});
