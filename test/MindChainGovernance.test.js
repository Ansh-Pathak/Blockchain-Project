const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("MindChainGovernance", function () {
  async function deployFixture() {
    const [admin, voterA, voterB, noTokens] = await ethers.getSigners();

    const RewardToken = await ethers.getContractFactory("RewardToken");
    const token = await RewardToken.connect(admin).deploy();
    await token.waitForDeployment();

    // Use admin as a stand-in minter so we can freely hand out voting tokens in tests.
    await token.connect(admin).setMinter(admin.address);
    await token.connect(admin).mint(voterA.address, ethers.parseEther("10"));
    await token.connect(admin).mint(voterB.address, ethers.parseEther("5"));

    const Governance = await ethers.getContractFactory("MindChainGovernance");
    const governance = await Governance.deploy(await token.getAddress());
    await governance.waitForDeployment();

    return { token, governance, admin, voterA, voterB, noTokens };
  }

  it("requires holding tokens to create a proposal", async function () {
    const { governance, noTokens } = await deployFixture();
    await expect(governance.connect(noTokens).createProposal("Increase session reward"))
      .to.be.revertedWith("Governance: must hold MIND tokens to propose");
  });

  it("lets a token holder create a proposal", async function () {
    const { governance, voterA } = await deployFixture();
    await expect(governance.connect(voterA).createProposal("Increase session reward"))
      .to.emit(governance, "ProposalCreated");

    const proposal = await governance.proposals(0);
    expect(proposal.description).to.equal("Increase session reward");
    expect(proposal.proposer).to.equal(voterA.address);
  });

  it("weights votes by token balance", async function () {
    const { governance, voterA, voterB } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");

    await governance.connect(voterA).vote(0, true);   // 10 MIND for
    await governance.connect(voterB).vote(0, false);  // 5 MIND against

    const proposal = await governance.proposals(0);
    expect(proposal.votesFor).to.equal(ethers.parseEther("10"));
    expect(proposal.votesAgainst).to.equal(ethers.parseEther("5"));
  });

  it("prevents voting twice on the same proposal", async function () {
    const { governance, voterA } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");
    await governance.connect(voterA).vote(0, true);

    await expect(governance.connect(voterA).vote(0, true))
      .to.be.revertedWith("Governance: already voted");
  });

  it("blocks voting from wallets with no tokens", async function () {
    const { governance, voterA, noTokens } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");

    await expect(governance.connect(noTokens).vote(0, true))
      .to.be.revertedWith("Governance: must hold MIND tokens to vote");
  });

  it("blocks finalizing before the voting period ends", async function () {
    const { governance, voterA } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");

    await expect(governance.finalizeProposal(0))
      .to.be.revertedWith("Governance: voting period not yet ended");
  });

  it("marks a proposal as Passed when votesFor > votesAgainst after the voting period", async function () {
    const { governance, voterA, voterB } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");
    await governance.connect(voterA).vote(0, true);   // 10 for
    await governance.connect(voterB).vote(0, false);  // 5 against

    await time.increase(3 * 24 * 60 * 60 + 1); // fast-forward past the 3 day voting period

    await expect(governance.finalizeProposal(0))
      .to.emit(governance, "ProposalFinalized");

    const proposal = await governance.proposals(0);
    expect(proposal.state).to.equal(1); // 1 = Passed
  });

  it("marks a proposal as Failed when votesAgainst >= votesFor after the voting period", async function () {
    const { governance, voterA, voterB } = await deployFixture();
    await governance.connect(voterB).createProposal("Risky change");
    await governance.connect(voterA).vote(0, false);  // 10 against
    await governance.connect(voterB).vote(0, true);   // 5 for

    await time.increase(3 * 24 * 60 * 60 + 1);
    await governance.finalizeProposal(0);

    const proposal = await governance.proposals(0);
    expect(proposal.state).to.equal(2); // 2 = Failed
  });

  it("does not allow voting after the deadline has passed", async function () {
    const { governance, voterA } = await deployFixture();
    await governance.connect(voterA).createProposal("Increase session reward");

    await time.increase(3 * 24 * 60 * 60 + 1);

    await expect(governance.connect(voterA).vote(0, true))
      .to.be.revertedWith("Governance: voting period has ended");
  });
});
