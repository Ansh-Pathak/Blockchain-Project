const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("TherapistRegistry", function () {
  async function deployFixture() {
    const [admin, therapist, other] = await ethers.getSigners();
    const TherapistRegistry = await ethers.getContractFactory("TherapistRegistry");
    // admin is whichever account deploys the contract
    const registry = await TherapistRegistry.connect(admin).deploy();
    await registry.waitForDeployment();
    return { registry, admin, therapist, other };
  }

  const fakeCredentialHash = ethers.keccak256(ethers.toUtf8Bytes("license-12345"));

  it("sets the deployer as admin", async function () {
    const { registry, admin } = await deployFixture();
    expect(await registry.admin()).to.equal(admin.address);
  });

  it("lets a wallet apply as a therapist", async function () {
    const { registry, therapist } = await deployFixture();

    await expect(registry.connect(therapist).applyAsTherapist(fakeCredentialHash))
      .to.emit(registry, "TherapistApplied");

    const record = await registry.therapists(therapist.address);
    expect(record.status).to.equal(1); // 1 = Pending
  });

  it("only lets the admin approve an application", async function () {
    const { registry, therapist, other } = await deployFixture();
    await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);

    await expect(registry.connect(other).approveTherapist(therapist.address))
      .to.be.revertedWith("TherapistRegistry: caller is not admin");
  });

  it("lets the admin approve a pending application", async function () {
    const { registry, admin, therapist } = await deployFixture();
    await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);

    await expect(registry.connect(admin).approveTherapist(therapist.address))
      .to.emit(registry, "TherapistApproved");

    expect(await registry.isApprovedTherapist(therapist.address)).to.equal(true);
  });

  it("lets the admin reject a pending application", async function () {
    const { registry, admin, therapist } = await deployFixture();
    await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);

    await registry.connect(admin).rejectTherapist(therapist.address);

    expect(await registry.isApprovedTherapist(therapist.address)).to.equal(false);
    const record = await registry.therapists(therapist.address);
    expect(record.status).to.equal(3); // 3 = Rejected
  });

  it("does not allow re-applying while already approved", async function () {
    const { registry, admin, therapist } = await deployFixture();
    await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);
    await registry.connect(admin).approveTherapist(therapist.address);

    await expect(registry.connect(therapist).applyAsTherapist(fakeCredentialHash))
      .to.be.revertedWith("TherapistRegistry: application already pending or approved");
  });

  // ── New: transferAdmin tests ──

  describe("transferAdmin", function () {
    it("lets the admin transfer admin role to a new address", async function () {
      const { registry, admin, other } = await deployFixture();

      await expect(registry.connect(admin).transferAdmin(other.address))
        .to.emit(registry, "AdminTransferred")
        .withArgs(admin.address, other.address);

      expect(await registry.admin()).to.equal(other.address);
    });

    it("rejects transferAdmin from a non-admin caller", async function () {
      const { registry, other } = await deployFixture();

      await expect(registry.connect(other).transferAdmin(other.address))
        .to.be.revertedWith("TherapistRegistry: caller is not admin");
    });

    it("rejects transferAdmin to the zero address", async function () {
      const { registry, admin } = await deployFixture();

      await expect(registry.connect(admin).transferAdmin(ethers.ZeroAddress))
        .to.be.revertedWith("TherapistRegistry: new admin cannot be zero address");
    });

    it("lets the new admin approve therapists after transfer", async function () {
      const { registry, admin, therapist, other } = await deployFixture();

      // Transfer admin to `other`
      await registry.connect(admin).transferAdmin(other.address);

      // Old admin can no longer approve
      await registry.connect(therapist).applyAsTherapist(fakeCredentialHash);
      await expect(registry.connect(admin).approveTherapist(therapist.address))
        .to.be.revertedWith("TherapistRegistry: caller is not admin");

      // New admin can approve
      await registry.connect(other).approveTherapist(therapist.address);
      expect(await registry.isApprovedTherapist(therapist.address)).to.equal(true);
    });
  });
});

