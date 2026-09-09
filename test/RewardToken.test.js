const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("RewardToken", function () {
  async function deployFixture() {
    const [owner, minterStandIn, other] = await ethers.getSigners();
    const RewardToken = await ethers.getContractFactory("RewardToken");
    const token = await RewardToken.connect(owner).deploy();
    await token.waitForDeployment();
    return { token, owner, minterStandIn, other };
  }

  it("has the expected name and symbol", async function () {
    const { token } = await deployFixture();
    expect(await token.name()).to.equal("MindChain Reward Token");
    expect(await token.symbol()).to.equal("MIND");
  });

  it("only lets the owner set the minter", async function () {
    const { token, other, minterStandIn } = await deployFixture();
    await expect(token.connect(other).setMinter(minterStandIn.address))
      .to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("blocks minting from anyone but the configured minter", async function () {
    const { token, owner, other } = await deployFixture();
    await expect(token.connect(other).mint(other.address, 100))
      .to.be.revertedWith("RewardToken: caller is not the minter");
  });

  it("lets the configured minter mint tokens", async function () {
    const { token, owner, minterStandIn, other } = await deployFixture();
    await token.connect(owner).setMinter(minterStandIn.address);

    await token.connect(minterStandIn).mint(other.address, 500);

    expect(await token.balanceOf(other.address)).to.equal(500);
  });
});
