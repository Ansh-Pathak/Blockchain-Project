// Regenerates frontend/src/contracts/abis.js from the compiled Hardhat
// artifacts. Run this any time you change a contract's functions/events:
//
//   npx hardhat compile
//   node scripts/export-abis.js
//
const fs = require("fs");
const path = require("path");

const contracts = [
  "PatientRegistry",
  "TherapistRegistry",
  "RewardToken",
  "SessionEscrow",
  "MindChainGovernance",
];

let output = "// Auto-generated from Hardhat compile artifacts.\n";
output += "// Re-run `node scripts/export-abis.js` after changing any contract.\n\n";

for (const name of contracts) {
  const artifactPath = path.join(__dirname, "..", "artifacts", "contracts", `${name}.sol`, `${name}.json`);
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  output += `export const ${name}ABI = ${JSON.stringify(artifact.abi, null, 2)};\n\n`;
}

const outputPath = path.join(__dirname, "..", "frontend", "src", "contracts", "abis.js");
fs.writeFileSync(outputPath, output);
console.log("Wrote", outputPath);
