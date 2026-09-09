// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal interfaces for the two contracts SessionEscrow needs to talk
/// to. We only declare the functions we actually use, rather than importing
/// the whole contract - this keeps compilation lighter and makes the
/// dependency explicit and easy to read.
interface ITherapistRegistry {
    function isApprovedTherapist(address therapistAddr) external view returns (bool);
}

interface IRewardToken {
    function mint(address to, uint256 amount) external;
}

/// @title SessionEscrow
/// @notice Handles booking and payment for a therapy session. A patient pays
/// a session fee which is held in this contract (escrow) rather than sent
/// directly to the therapist. Funds are only released once the session is
/// confirmed complete, and the therapist is rewarded with RewardToken at
/// the same time.
contract SessionEscrow {
    enum SessionStatus {
        Requested,  // patient paid, waiting for therapist to confirm completion
        Completed,  // therapist confirmed, funds + reward released
        Cancelled   // patient cancelled before completion, refunded
    }

    struct Session {
        address patient;
        address therapist;
        uint256 amount;
        SessionStatus status;
        uint256 createdAt;
    }

    /// @notice How many reward tokens a therapist earns per completed session.
    /// 10 * 10^18 = 10 whole MIND tokens (ERC20 amounts are stored in the
    /// smallest unit, same idea as cents for dollars, but with 18 decimals).
    uint256 public constant REWARD_PER_SESSION = 10 * 10 ** 18;

    ITherapistRegistry public immutable therapistRegistry;
    IRewardToken public immutable rewardToken;

    /// @notice All sessions ever booked, indexed by an auto-incrementing ID.
    mapping(uint256 => Session) public sessions;
    uint256 public nextSessionId;

    event SessionBooked(uint256 indexed sessionId, address indexed patient, address indexed therapist, uint256 amount);
    event SessionCompleted(uint256 indexed sessionId, uint256 rewardMinted);
    event SessionCancelled(uint256 indexed sessionId);

    constructor(address therapistRegistryAddress, address rewardTokenAddress) {
        therapistRegistry = ITherapistRegistry(therapistRegistryAddress);
        rewardToken = IRewardToken(rewardTokenAddress);
    }

    /// @notice Book a session with an approved therapist, paying the session
    /// fee into escrow. The fee is whatever ETH amount you send with the call.
    function bookSession(address therapist) external payable returns (uint256 sessionId) {
        require(msg.value > 0, "SessionEscrow: payment required");
        require(therapistRegistry.isApprovedTherapist(therapist), "SessionEscrow: therapist not approved");

        sessionId = nextSessionId++;
        sessions[sessionId] = Session({
            patient: msg.sender,
            therapist: therapist,
            amount: msg.value,
            status: SessionStatus.Requested,
            createdAt: block.timestamp
        });

        emit SessionBooked(sessionId, msg.sender, therapist, msg.value);
    }

    /// @notice Called by the therapist to confirm a session took place.
    /// Releases the escrowed payment to the therapist and mints their reward tokens.
    function confirmSession(uint256 sessionId) external {
        Session storage session = sessions[sessionId];
        require(session.status == SessionStatus.Requested, "SessionEscrow: session not in requested state");
        require(msg.sender == session.therapist, "SessionEscrow: only the assigned therapist can confirm");

        session.status = SessionStatus.Completed;

        (bool sent, ) = payable(session.therapist).call{value: session.amount}("");
        require(sent, "SessionEscrow: payment transfer failed");

        rewardToken.mint(session.therapist, REWARD_PER_SESSION);

        emit SessionCompleted(sessionId, REWARD_PER_SESSION);
    }

    /// @notice Called by the patient to cancel a session before it's
    /// completed, refunding their payment in full.
    function cancelSession(uint256 sessionId) external {
        Session storage session = sessions[sessionId];
        require(session.status == SessionStatus.Requested, "SessionEscrow: session not in requested state");
        require(msg.sender == session.patient, "SessionEscrow: only the booking patient can cancel");

        session.status = SessionStatus.Cancelled;

        (bool sent, ) = payable(session.patient).call{value: session.amount}("");
        require(sent, "SessionEscrow: refund transfer failed");

        emit SessionCancelled(sessionId);
    }
}
