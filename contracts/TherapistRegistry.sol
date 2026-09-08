// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TherapistRegistry
/// @notice Lets a wallet apply to become a verified therapist, and lets an
/// admin approve or reject that application.
/// @dev Full DAO-based verification (where token holders vote on therapist
/// applications instead of a single admin) is planned as Phase 2. Using a
/// single admin for now keeps the trust model simple and easy to demo, while
/// keeping the same data shape (Therapist struct, events) that the future
/// DAO-vote version will reuse.
contract TherapistRegistry {
    enum Status {
        NotApplied,
        Pending,
        Approved,
        Rejected
    }

    struct Therapist {
        bytes32 credentialHash; // hash of off-chain license/credential documents
        Status status;
        uint256 appliedAt;
    }

    /// @notice The admin account allowed to approve/reject applications.
    /// In Phase 2 this role is replaced by DAO vote outcomes.
    address public admin;

    /// @notice Each wallet's therapist application data.
    mapping(address => Therapist) public therapists;

    event TherapistApplied(address indexed therapist, bytes32 credentialHash, uint256 timestamp);
    event TherapistApproved(address indexed therapist, uint256 timestamp);
    event TherapistRejected(address indexed therapist, uint256 timestamp);

    modifier onlyAdmin() {
        require(msg.sender == admin, "TherapistRegistry: caller is not admin");
        _;
    }

    /// @dev The deployer becomes the initial admin.
    constructor() {
        admin = msg.sender;
    }

    /// @notice Apply to become a verified therapist.
    /// @param credentialHash Hash of off-chain license/qualification documents.
    function applyAsTherapist(bytes32 credentialHash) external {
        require(
            therapists[msg.sender].status != Status.Pending &&
            therapists[msg.sender].status != Status.Approved,
            "TherapistRegistry: application already pending or approved"
        );

        therapists[msg.sender] = Therapist({
            credentialHash: credentialHash,
            status: Status.Pending,
            appliedAt: block.timestamp
        });

        emit TherapistApplied(msg.sender, credentialHash, block.timestamp);
    }

    /// @notice Approve a pending therapist application. Admin-only for now.
    function approveTherapist(address therapistAddr) external onlyAdmin {
        require(therapists[therapistAddr].status == Status.Pending, "TherapistRegistry: no pending application");
        therapists[therapistAddr].status = Status.Approved;
        emit TherapistApproved(therapistAddr, block.timestamp);
    }

    /// @notice Reject a pending therapist application. Admin-only for now.
    function rejectTherapist(address therapistAddr) external onlyAdmin {
        require(therapists[therapistAddr].status == Status.Pending, "TherapistRegistry: no pending application");
        therapists[therapistAddr].status = Status.Rejected;
        emit TherapistRejected(therapistAddr, block.timestamp);
    }

    /// @notice Convenience check used by other contracts (e.g. SessionEscrow later)
    /// to confirm a therapist is approved before allowing a session to be booked.
    function isApprovedTherapist(address therapistAddr) external view returns (bool) {
        return therapists[therapistAddr].status == Status.Approved;
    }
}
