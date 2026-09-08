const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

describe("PatientRegistry", function () {
  async function deployFixture() {
    const [patient, other] = await ethers.getSigners();
    const PatientRegistry = await ethers.getContractFactory("PatientRegistry");
    const registry = await PatientRegistry.deploy();
    await registry.waitForDeployment();
    return { registry, patient, other };
  }

  it("lets a wallet register as a patient", async function () {
    const { registry, patient } = await deployFixture();

    expect(await registry.isRegisteredPatient(patient.address)).to.equal(false);

    await expect(registry.connect(patient).registerAsPatient())
      .to.emit(registry, "PatientRegistered");

    expect(await registry.isRegisteredPatient(patient.address)).to.equal(true);
  });

  it("does not allow registering twice", async function () {
    const { registry, patient } = await deployFixture();
    await registry.connect(patient).registerAsPatient();

    await expect(registry.connect(patient).registerAsPatient())
      .to.be.revertedWith("PatientRegistry: already registered");
  });

  it("blocks journal entries from unregistered wallets", async function () {
    const { registry, other } = await deployFixture();
    const fakeHash = ethers.keccak256(ethers.toUtf8Bytes("some journal text"));

    await expect(registry.connect(other).logJournalEntry(fakeHash))
      .to.be.revertedWith("PatientRegistry: not a registered patient");
  });

  it("logs a journal entry hash for a registered patient", async function () {
    const { registry, patient } = await deployFixture();
    await registry.connect(patient).registerAsPatient();

    const contentHash = ethers.keccak256(ethers.toUtf8Bytes("Today was a hard day, but I made it through."));

    await expect(registry.connect(patient).logJournalEntry(contentHash))
      .to.emit(registry, "JournalEntryLogged")
      .withArgs(patient.address, contentHash, anyValue);

    expect(await registry.getJournalEntryCount(patient.address)).to.equal(1);

    const [, storedHash] = await registry.getJournalEntry(patient.address, 0);
    expect(storedHash).to.equal(contentHash);
  });
});
