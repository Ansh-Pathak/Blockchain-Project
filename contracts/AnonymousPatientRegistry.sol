// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISemaphore} from "@semaphore-protocol/contracts/interfaces/ISemaphore.sol";

/// @dev Minimal interface for checking patient registration status.
interface IPatientRegistry {
    function isRegisteredPatient(address patient) external view returns (bool);
}

/// @title AnonymousPatientRegistry
/// @notice Provides zero-knowledge anonymous journaling for patients.
/// Patients register openly (via PatientRegistry), then join an on-chain
/// Semaphore group by submitting an identity commitment. Once in the group,
/// they can log journal entries by generating a ZK proof of membership —
/// proving "I am a registered patient" WITHOUT revealing WHICH patient.
///
/// @dev This contract does NOT inherit from Semaphore — it holds a
/// reference to a deployed Semaphore instance and delegates group/proof
/// management to it. This "composition over inheritance" approach is
/// simpler, keeps our contract small, and avoids Solidity diamond-
/// inheritance issues with the Semaphore base contracts.
contract AnonymousPatientRegistry {
    // ───────────────────── State ─────────────────────

    /// @notice The deployed Semaphore contract that manages the Merkle
    /// group and verifies ZK proofs on our behalf.
    ISemaphore public immutable semaphore;

    /// @notice The existing patient registry — used as a sybil gate so
    /// only real registered patients can join the anonymous group.
    IPatientRegistry public immutable patientRegistry;

    /// @notice The Semaphore group ID that holds all patient identity
    /// commitments. Created once in the constructor.
    uint256 public patientGroupId;

    /// @notice Tracks which wallet addresses have already joined the
    /// anonymous group, to prevent a single patient from adding
    /// multiple identity commitments.
    mapping(address => bool) public hasJoinedGroup;

    /// @notice Stores all anonymously-logged journal content hashes,
    /// in the order they were submitted. Because these are anonymous,
    /// they are NOT keyed by address — just a flat list.
    bytes32[] public anonymousJournalHashes;

    // ───────────────────── Events ─────────────────────

    /// @notice Emitted when a patient joins the anonymous group.
    /// NOTE: This event intentionally includes the wallet address,
    /// because joining the group is the ONE non-anonymous action (we
    /// need to gate it). The identity commitment is a hash of a NEW
    /// key — it cannot be linked back to this wallet on-chain.
    event PatientJoinedGroup(address indexed patient, uint256 identityCommitment);

    /// @notice Emitted when an anonymous journal entry is logged.
    /// NOTE: No address — this is the whole point of ZK anonymity.
    event AnonymousJournalLogged(
        bytes32 indexed contentHash,
        uint256 nullifierHash,
        uint256 timestamp
    );

    // ───────────────────── Constructor ─────────────────────

    /// @param semaphoreAddress Address of the deployed Semaphore contract.
    /// @param patientRegistryAddress Address of the existing PatientRegistry.
    constructor(address semaphoreAddress, address patientRegistryAddress) {
        semaphore = ISemaphore(semaphoreAddress);
        patientRegistry = IPatientRegistry(patientRegistryAddress);

        // Create a Semaphore group owned by THIS contract so that
        // only our joinAnonymousGroup() function can add members.
        patientGroupId = semaphore.createGroup(address(this));
    }

    // ───────────────────── Join Group ─────────────────────

    /// @notice Join the anonymous patient group by submitting an identity
    /// commitment. This is a one-time action that links your wallet to
    /// the group (for sybil resistance), but the commitment itself is
    /// a hash of a DIFFERENT key generated client-side — so future
    /// proofs cannot be traced back to this wallet.
    ///
    /// @param identityCommitment The Poseidon hash of the patient's
    /// client-side-generated EdDSA public key.
    function joinAnonymousGroup(uint256 identityCommitment) external {
        require(
            patientRegistry.isRegisteredPatient(msg.sender),
            "AnonymousPatientRegistry: must be a registered patient"
        );
        require(
            !hasJoinedGroup[msg.sender],
            "AnonymousPatientRegistry: already joined the anonymous group"
        );

        hasJoinedGroup[msg.sender] = true;

        // Delegate member addition to the Semaphore contract.
        // This works because our contract is the group admin (set in constructor).
        semaphore.addMember(patientGroupId, identityCommitment);

        emit PatientJoinedGroup(msg.sender, identityCommitment);
    }

    // ───────────────────── Anonymous Journaling ─────────────────────

    /// @notice Log a journal entry anonymously using a ZK proof of group
    /// membership. The proof demonstrates that the caller knows a private
    /// key whose commitment is in the Semaphore group, without revealing
    /// which commitment (i.e., which patient) it belongs to.
    ///
    /// @dev The `message` field of the SemaphoreProof carries the
    /// contentHash (cast to uint256). The `scope` field is ALSO set to
    /// contentHash. Why? In Semaphore v4, nullifier = hash(scope, secret).
    /// Using a per-entry scope means each journal entry gets its own
    /// nullifier domain — so the same patient can submit multiple entries
    /// (different scopes = different nullifiers) while still being unable
    /// to submit the SAME entry twice (same scope = same nullifier).
    ///
    /// @param contentHash The keccak256 hash of the encrypted journal
    /// entry content (the actual text is stored off-chain on IPFS).
    /// @param proof The Semaphore ZK proof struct containing merkle depth,
    /// root, nullifier, message (= contentHash), scope (= contentHash),
    /// and the 8 Groth16 proof points.
    function logAnonymousJournal(
        bytes32 contentHash,
        ISemaphore.SemaphoreProof calldata proof
    ) external {
        // Verify that the proof's message matches the contentHash being stored.
        // This prevents someone from replaying a valid proof with a different hash.
        require(
            proof.message == uint256(contentHash),
            "AnonymousPatientRegistry: proof message must match contentHash"
        );

        // Verify that the proof is scoped to this specific content hash.
        // This ensures each entry gets a unique nullifier domain.
        require(
            proof.scope == uint256(contentHash),
            "AnonymousPatientRegistry: proof scope must match contentHash"
        );

        // Delegate proof verification + nullifier tracking to Semaphore.
        // validateProof checks:
        //   1. The ZK proof is mathematically valid
        //   2. The merkle root is (or was recently) a valid root of the group
        //   3. The nullifier has not been used before in this group
        // If any check fails, it reverts.
        semaphore.validateProof(patientGroupId, proof);

        // Store the content hash.
        anonymousJournalHashes.push(contentHash);

        emit AnonymousJournalLogged(contentHash, proof.nullifier, block.timestamp);
    }

    // ───────────────────── View Functions ─────────────────────

    /// @notice Returns how many anonymous journal entries have been logged.
    function getAnonymousJournalCount() external view returns (uint256) {
        return anonymousJournalHashes.length;
    }

    /// @notice Returns a specific anonymous journal hash by index.
    function getAnonymousJournalHash(uint256 index) external view returns (bytes32) {
        return anonymousJournalHashes[index];
    }
}
