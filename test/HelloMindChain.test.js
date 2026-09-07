const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("HelloMindChain (Day 1 environment check)", function () {
  it("deploys and returns the expected project name", async function () {
    const HelloMindChain = await ethers.getContractFactory("HelloMindChain");
    const hello = await HelloMindChain.deploy();
    await hello.waitForDeployment();

    expect(await hello.projectName()).to.equal("MindChain DAO");
    expect(await hello.ping()).to.equal("MindChain DAO environment is working");
  });
});
