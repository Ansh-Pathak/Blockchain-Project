# MindChain DAO

A blockchain-based, privacy-preserving mental health support platform built on Ethereum.
Patients log mental health journeys anonymously, verified therapists earn token rewards for
sessions, and a DAO governs therapist verification and platform policy.

Aligned with **SDG 3: Good Health and Well-Being**.

## Problem

Existing mental health support systems suffer from:
- Lack of privacy and fear of disclosure to institutions
- Fragmented, non-portable mental health records
- No mechanism for peer-based support validation
- Therapist shortage and long wait times

## Solution

- Verified therapists log support sessions immutably on-chain
- Therapists and peer supporters earn tokens for verified, quality help
- Tamper-proof, user-owned mental health records, portable across institutions
- Community (DAO) governance over therapist verification and platform policy

## Why Ethereum

Ethereum was chosen over Hyperledger because it is public and permissionless (no
gatekeeper institution needed), has native token support for the reward model, has the
largest audited smart-contract library ecosystem (OpenZeppelin), and has mature tooling
(Hardhat, Etherscan) for testing, deployment, and verification — all important for a
project handling sensitive health data.

## Architecture

Three layers:
1. **On-chain (Ethereum):** identity, permissions, session records, token balances, DAO
   votes — anything that must be permanent and tamper-proof. Only hashes are stored
   on-chain, not raw journal content.
2. **Off-chain storage:** encrypted journal entries and session notes (too large/sensitive
   for on-chain storage).
3. **Frontend:** the UI the user interacts with. No usernames or passwords — a connected
   wallet address is the user's identity.

## Project status (updated as of Day 1 of 7)

This is being built incrementally toward a 50% functional checkpoint. Some advanced
features described in the original proposal are intentionally simplified for now and
will be built out in a later phase:

| Feature | Status |
|---|---|
| Zero-knowledge anonymous identity | Planned (Phase 2) — using wallet address as identity for now |
| Off-chain encrypted storage (IPFS) | Planned (Phase 2) — journal entry hash stored on-chain, content mocked for now |
| Therapist DAO verification vote | Planned (Phase 2) — admin-approved for now |
| Patient & Therapist registry contracts | In progress |
| Session escrow + token reward contract | In progress |
| Basic DAO proposal/vote contract | In progress |
| Frontend wallet connect + contract integration | In progress |

## Tech stack

- Solidity ^0.8.24
- Hardhat (compile, test, deploy, verify)
- Ethereum Sepolia testnet
- React + ethers.js (frontend, added Day 5-6)

## Getting started

```bash
npm install
cp .env.example .env   # fill in your own RPC URL / private key / Etherscan key
npx hardhat compile
npx hardhat test
```

Deploy to a local network:
```bash
npx hardhat node                          # in one terminal
npx hardhat run scripts/deploy.js --network localhost   # in another
```

Deploy to Sepolia testnet:
```bash
npx hardhat run scripts/deploy.js --network sepolia
```

## Project timeline

- **Day 1:** Environment + network setup ✅
- **Day 2:** Patient & Therapist registry contracts
- **Day 3:** Session escrow + reward token contracts
- **Day 4:** DAO governance contract + Sepolia deployment
- **Day 5:** Frontend skeleton + wallet connect
- **Day 6:** Frontend write functions + end-to-end demo flow
- **Day 7:** Documentation, cleanup, demo prep
