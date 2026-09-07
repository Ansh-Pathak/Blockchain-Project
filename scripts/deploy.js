const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  const HelloMindChain = await ethers.getContractFactory("HelloMindChain");
  const hello = await HelloMindChain.deploy();
  await hello.waitForDeployment();

  console.log("HelloMindChain deployed to:", await hello.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
