// Shared helper: reads the addresses written by deploy-all.js so scripts
// like demo-seed.js don't need their own hardcoded copy that could drift
// out of sync.
const fs = require("fs");
const path = require("path");

const addressesPath = path.join(__dirname, "..", "deployed-addresses.json");

if (!fs.existsSync(addressesPath)) {
  throw new Error(
    `Could not find ${addressesPath}. Run "npx hardhat run scripts/deploy-all.js --network localhost" first.`
  );
}

const CONTRACT_ADDRESSES = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

module.exports = { CONTRACT_ADDRESSES };
