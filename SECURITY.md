# MindChain DAO — Security Policy & Threat Model

This document outlines the security architecture, threat model, implemented controls, known limitations, and hardening roadmap for **MindChain DAO**.

---

## 1. System Overview & Assets

MindChain DAO is a decentralized, privacy-preserving mental health platform operating on Ethereum. The system protects four primary categories of assets:

1. **Patient Privacy & Confidentiality:** Preventing linkability between real-world identities, wallet addresses, and sensitive mental health journals.
2. **Escrow Funds:** Safeguarding patient ETH held in escrow during therapy appointments.
3. **MIND Token Integrity:** Ensuring tokens are minted strictly for verified, completed therapy sessions.
4. **DAO Governance Authority:** Guaranteeing administrative permissions (e.g. therapist verification) are exercised only through valid community consensus.

---

## 2. Threat Model & Actor Taxonomy

| Actor | Access Level | Trust Assumptions | Potential Misbehavior / Threats |
|---|---|---|---|
| **Patient** | Public / Registered | Untrusted | Sybil registration, double-spending escrow, leaking journal associations. |
| **Anonymous Patient** | ZK Group Member | Cryptographically Trustless | Attempting to link proof to identity, double-signaling identical journal entries. |
| **Therapist** | Applied / Approved | Semi-trusted after approval | Abandoning booked sessions, attempting early escrow withdrawal without session completion. |
| **DAO Voter** | MIND Token Holder | Self-interested | Flash-loaning tokens to manipulate votes, passing malicious executable proposals. |
| **External Attacker** | Network / Public | Untrusted | Front-running, reentrancy attacks, replaying ZK proofs across different journal hashes. |

---

## 3. Cryptographic Privacy & ZK Implementation

### 3.1 Semaphore Zero-Knowledge Proofs
- **Architecture:** `AnonymousPatientRegistry` delegates membership and proof validation to the official Semaphore protocol contracts (`ISemaphore`).
- **Sybil Gate:** Only addresses already registered in `PatientRegistry` can invoke `joinAnonymousGroup(identityCommitment)`.
- **Identity Isolation:** The patient generates a random Semaphore EdDSA secret scalar client-side. The public identity commitment is added to the on-chain Merkle tree. Once added, all future proofs are generated off-chain using the private scalar.
- **Scope & Message Binding:**
  - `proof.message == uint256(contentHash)`: Binds the mathematical proof directly to the specific journal content hash, preventing front-running or proof theft.
  - `proof.scope == uint256(contentHash)`: Scopes the Semaphore nullifier to this exact journal entry. This permits patients to submit multiple unique journals over time while strictly blocking double-submissions of the same entry.

### 3.2 Client-Side AES-GCM 256-bit Encryption
- Plaintext journal contents **never** touch the Ethereum blockchain or IPFS unencrypted.
- Text is encrypted in the browser using the Web Crypto API (`SubtleCrypto`) with 256-bit AES-GCM and a cryptographically secure 96-bit initialization vector (IV).
- The derived encryption key remains local to the user (derived from their ZK private scalar or private passphrase).

---

## 4. Smart Contract Security Controls

### 4.1 SessionEscrow
- **Reentrancy Protection:** Inherits OpenZeppelin `ReentrancyGuard` on all state-modifying functions involving ETH transfers (`confirmSession`, `cancelSession`, `claimTimeout`).
- **Checks-Effects-Interactions (CEI):** Session status is updated to `Completed` or `Cancelled` **before** ETH is transferred to the therapist or refunded to the patient.
- **7-Day Safety Timeout:** If an approved therapist fails to confirm a session within `SESSION_TIMEOUT` (7 days), the patient can unconditionally reclaim their escrowed funds via `claimTimeout()`.
- **Restricted Minter Wiring:** `RewardToken` can only be minted by its designated `minter` address, which is wired to `SessionEscrow` during deployment. Therapists only receive MIND tokens upon confirmed session completion.

### 4.2 TherapistRegistry
- **Role Control:** Only the `admin` address can approve or reject therapist applications.
- **DAO Admin Transfer:** `transferAdmin(newAdmin)` allows migrating the administrative authority to `MindChainGovernance`, removing single-deployer centralization.

---

## 5. Known Governance Limitations (Documented Audit Findings)

The initial version of `MindChainGovernance.sol` prioritizes simplicity for demonstration. In an enterprise production deployment, the following limitations must be addressed:

### 5.1 Live `balanceOf` Voting vs. Checkpointed Snapshot
- **Observation:** `castVote()` checks `votingToken.balanceOf(msg.sender)` at the time the vote is submitted.
- **Risk:** A voter could vote on a proposal, immediately transfer their MIND tokens to a second wallet, and vote again, or use flash loans/lending protocols to temporarily inflate voting weight during an active proposal.
- **Mitigation / Roadmap:** Upgrade to OpenZeppelin's `ERC20Votes` standard with historical checkpointing (`getPastVotes(account, proposalSnapshot)`).

### 5.2 Lack of Minimum Quorum
- **Observation:** `finalizeProposal()` requires `votesFor > votesAgainst`. If only 1 vote is cast in favor and 0 against over 3 days, the proposal passes.
- **Risk:** Low-turnout malicious proposals could pass undetected.
- **Mitigation / Roadmap:** Introduce a minimum quorum requirement (e.g., at least 10% of total circulating MIND supply must participate).

### 5.3 Instant Execution without Timelock
- **Observation:** Passed executable proposals can be invoked immediately via `executeProposal()` with no timelock delay.
- **Risk:** If a malicious proposal passes, token holders have no grace period to exit or intervene before arbitrary contract calls are executed.
- **Mitigation / Roadmap:** Route execution through OpenZeppelin `TimelockController` with a mandatory 48-hour delay.

---

## 6. Hardening & Production Roadmap

1. **Gasless ZK Submissions (Relayers / Account Abstraction):**
   - Currently, the patient wallet submits the `logAnonymousJournal()` transaction. While the contract does not link the msg.sender to the journal entry or commitment, on-chain observers might correlate gas payments.
   - Roadmap: Implement ERC-4337 or a dedicated Semaphore Relayer pool where anonymous entries are sponsored and submitted by a relayer network.
2. **OpenZeppelin Governor Migration:**
   - Replace custom governance logic with OpenZeppelin `GovernorCountingSimple` and `GovernorVotesQuorumFraction`.
3. **Decentralized KMS / Threshold Decryption:**
   - Enable shared patient-therapist access to encrypted journals using Lit Protocol or threshold ECDSA encryption so designated therapists can review shared health history with patient consent.
