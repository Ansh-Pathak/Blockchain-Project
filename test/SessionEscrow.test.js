const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("SessionEscrow", function () {
  async function deployFixture() {
    const [admin, patient, therapist, otherTherapist] = await ethers.getSigners();

    const TherapistRegistry = await ethers.getContractFactory("TherapistRegistry");
    const registry = await TherapistRegistry.connect(admin).deploy();
    await registry.waitForDeployment();

    const RewardToken = await ethers.getContractFactory("RewardToken");
    const token = await RewardToken.connect(admin).deploy();
    await token.waitForDeployment();

    const SessionEscrow = await ethers.getContractFactory("SessionEscrow");
    const escrow = await SessionEscrow.deploy(await registry.getAddress(), await token.getAddress());
    await escrow.waitForDeployment();

    // Wire the token's minter to the escrow contract, so escrow (and only escrow) can mint rewards.
    await token.connect(admin).setMinter(await escrow.getAddress());

    // Approve `therapist` through the normal apply -> admin approve flow from Day 2.
    const fakeCredentialHash = ethers.keccak256(ethers.toUtf8Bytes("license-999"));
    await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);
    await registry.connect(admin).approveTherapist(therapist.address);

    return { registry, token, escrow, admin, patient, therapist, otherTherapist };
  }

  const sessionFee = ethers.parseEther("0.05");

  it("rejects booking with an unapproved therapist", async function () {
    const { escrow, patient, otherTherapist } = await deployFixture();

    await expect(
      escrow.connect(patient).bookSession(otherTherapist.address, { value: sessionFee })
    ).to.be.revertedWith("SessionEscrow: therapist not approved");
  });

  it("rejects booking with no payment", async function () {
    const { escrow, patient, therapist } = await deployFixture();

    await expect(
      escrow.connect(patient).bookSession(therapist.address, { value: 0 })
    ).to.be.revertedWith("SessionEscrow: payment required");
  });

  it("holds the payment in escrow when a session is booked", async function () {
    const { escrow, patient, therapist } = await deployFixture();

    await expect(escrow.connect(patient).bookSession(therapist.address, { value: sessionFee }))
      .to.emit(escrow, "SessionBooked")
      .withArgs(0, patient.address, therapist.address, sessionFee);

    const escrowAddress = await escrow.getAddress();
    expect(await ethers.provider.getBalance(escrowAddress)).to.equal(sessionFee);
  });

  it("pays the therapist and mints reward tokens on confirmation", async function () {
    const { escrow, token, patient, therapist } = await deployFixture();

    await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

    const balanceBefore = await ethers.provider.getBalance(therapist.address);

    await expect(escrow.connect(therapist).confirmSession(0))
      .to.emit(escrow, "SessionCompleted");

    const balanceAfter = await ethers.provider.getBalance(therapist.address);
    // Therapist also pays their own gas for confirmSession, so we check the
    // balance went up by roughly the session fee rather than exactly (gas
    // makes an exact match unreliable), by confirming it increased at all
    // and the escrow contract's balance is now empty.
    expect(balanceAfter).to.be.greaterThan(balanceBefore);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0);

    expect(await token.balanceOf(therapist.address)).to.equal(ethers.parseEther("10"));
  });

  it("only lets the assigned therapist confirm the session", async function () {
    const { escrow, patient, therapist, otherTherapist } = await deployFixture();
    await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

    await expect(escrow.connect(otherTherapist).confirmSession(0))
      .to.be.revertedWith("SessionEscrow: only the assigned therapist can confirm");
  });

  it("refunds the patient on cancellation", async function () {
    const { escrow, patient, therapist } = await deployFixture();
    await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

    await expect(escrow.connect(patient).cancelSession(0))
      .to.emit(escrow, "SessionCancelled");

    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0);
  });

  it("does not allow confirming a session twice", async function () {
    const { escrow, patient, therapist } = await deployFixture();
    await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });
    await escrow.connect(therapist).confirmSession(0);

    await expect(escrow.connect(therapist).confirmSession(0))
      .to.be.revertedWith("SessionEscrow: session not in requested state");
  });

  // ── New: claimTimeout tests ──

  describe("claimTimeout", function () {
    it("exposes a SESSION_TIMEOUT constant of 7 days", async function () {
      const { escrow } = await deployFixture();
      const timeout = await escrow.SESSION_TIMEOUT();
      expect(timeout).to.equal(7 * 24 * 60 * 60); // 604800 seconds
    });

    it("rejects claimTimeout before the timeout period has elapsed", async function () {
      const { escrow, patient, therapist } = await deployFixture();
      await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

      // Try immediately — should fail
      await expect(escrow.connect(patient).claimTimeout(0))
        .to.be.revertedWith("SessionEscrow: timeout period not yet reached");

      // Try after 6 days — still should fail
      await time.increase(6 * 24 * 60 * 60);
      await expect(escrow.connect(patient).claimTimeout(0))
        .to.be.revertedWith("SessionEscrow: timeout period not yet reached");
    });

    it("lets the patient reclaim funds after the timeout period", async function () {
      const { escrow, patient, therapist } = await deployFixture();
      await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

      // Fast-forward past the 7-day timeout
      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(patient).claimTimeout(0))
        .to.emit(escrow, "SessionCancelled")
        .withArgs(0);

      // Escrow should be empty after refund
      expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0);
    });

    it("rejects claimTimeout from a non-patient wallet", async function () {
      const { escrow, patient, therapist } = await deployFixture();
      await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(therapist).claimTimeout(0))
        .to.be.revertedWith("SessionEscrow: only the booking patient can claim timeout");
    });

    it("rejects claimTimeout on an already-completed session", async function () {
      const { escrow, patient, therapist } = await deployFixture();
      await escrow.connect(patient).bookSession(therapist.address, { value: sessionFee });
      await escrow.connect(therapist).confirmSession(0);

      await time.increase(7 * 24 * 60 * 60 + 1);

      await expect(escrow.connect(patient).claimTimeout(0))
        .to.be.revertedWith("SessionEscrow: session not in requested state");
    });
  });
});

