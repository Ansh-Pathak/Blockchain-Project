// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PatientRegistry
/// @notice Lets any wallet register itself as a patient with no personal
/// information required - the wallet address IS the identity. Patients can
/// log journal entries by storing only a hash of the entry (the actual
/// encrypted content will live off-chain on IPFS in a later phase; for now
/// we just record the hash so the on-chain flow is provable).
/// @dev This is a simplified stand-in for the full zero-knowledge identity
/// system described in the project proposal. Real ZK anonymity (so that not
/// even the wallet address links sessions together) is planned as Phase 2.
contract PatientRegistry {
    /// @notice One journal entry: when it was written, and the hash of its
    /// (off-chain, encrypted) content.
    struct JournalEntry {
        uint256 timestamp;
        bytes32 contentHash;
    }

    /// @notice Tracks which addresses have registered as patients.
    mapping(address => bool) public isRegisteredPatient;

    /// @notice Each patient's list of journal entries, in the order they were written.
    mapping(address => JournalEntry[]) private journalEntries;

    /// @notice Emitted when a new wallet registers as a patient.
    event PatientRegistered(address indexed patient, uint256 timestamp);

    /// @notice Emitted whenever a patient logs a new journal entry.
    event JournalEntryLogged(address indexed patient, bytes32 contentHash, uint256 timestamp);

    /// @notice Restricts a function to wallets that have already registered.
    modifier onlyRegisteredPatient() {
        require(isRegisteredPatient[msg.sender], "PatientRegistry: not a registered patient");
        _;
    }

    /// @notice Registers the caller's wallet as a patient. No personal data required.
    function registerAsPatient() external {
        require(!isRegisteredPatient[msg.sender], "PatientRegistry: already registered");
        isRegisteredPatient[msg.sender] = true;
        emit PatientRegistered(msg.sender, block.timestamp);
    }

    /// @notice Logs a new journal entry for the caller.
    /// @param contentHash The keccak256 hash of the encrypted journal entry
    /// content (the real content is stored off-chain; only its fingerprint
    /// goes on-chain, so it's tamper-evident without being public).
    function logJournalEntry(bytes32 contentHash) external onlyRegisteredPatient {
        journalEntries[msg.sender].push(JournalEntry({
            timestamp: block.timestamp,
            contentHash: contentHash
        }));
        emit JournalEntryLogged(msg.sender, contentHash, block.timestamp);
    }

    /// @notice Returns how many journal entries a given patient has logged.
    function getJournalEntryCount(address patient) external view returns (uint256) {
        return journalEntries[patient].length;
    }

    /// @notice Returns a specific journal entry for a patient by index.
    function getJournalEntry(address patient, uint256 index)
        external
        view
        returns (uint256 timestamp, bytes32 contentHash)
    {
        JournalEntry storage entry = journalEntries[patient][index];
        return (entry.timestamp, entry.contentHash);
    }
}
