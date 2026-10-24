// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal interface for the ERC20 balance check we need for voting weight.
interface IVotingToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @title MindChainGovernance
/// @notice A DAO governance contract with executable proposals. Any MIND token
/// holder can create a proposal, and token holders vote with weight equal to
/// their token balance. After the voting period ends, anyone can finalize the
/// proposal. If the proposal carries an execution payload (target + callData),
/// anyone can call executeProposal() to make it happen on-chain.
contract MindChainGovernance {
    enum ProposalState {
        Active,
        Passed,
        Failed,
        Executed // Passed AND successfully executed its on-chain payload
    }

    struct Proposal {
        address proposer;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votingDeadline;
        ProposalState state;
        // ── Execution payload (Phase 2) ──
        address target;   // contract to call if passed (address(0) = no execution)
        bytes callData;   // encoded function call, e.g. abi.encodeWithSignature("approveTherapist(address)", addr)
        bool executed;    // prevents double-execution
    }

    /// @notice Token used to determine voting weight (1 MIND token = 1 vote).
    IVotingToken public immutable votingToken;

    /// @notice How long voting stays open after a proposal is created.
    uint256 public constant VOTING_PERIOD = 3 days;

    mapping(uint256 => Proposal) public proposals;
    uint256 public nextProposalId;

    /// @notice Tracks whether an address has already voted on a given proposal,
    /// to prevent double voting.
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, string description, uint256 votingDeadline);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bool support, uint256 weight);
    event ProposalFinalized(uint256 indexed proposalId, ProposalState state, uint256 votesFor, uint256 votesAgainst);
    event ProposalExecuted(uint256 indexed proposalId, address indexed target, bytes callData);

    constructor(address votingTokenAddress) {
        votingToken = IVotingToken(votingTokenAddress);
    }

    /// @notice Create a simple (non-executable) proposal. Requires holding at
    /// least 1 MIND token, so only participants who've actually completed
    /// sessions can propose. This is the original function — kept for backward
    /// compatibility.
    function createProposal(string calldata description) external returns (uint256 proposalId) {
        require(votingToken.balanceOf(msg.sender) > 0, "Governance: must hold MIND tokens to propose");

        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.description = description;
        p.votingDeadline = block.timestamp + VOTING_PERIOD;
        p.state = ProposalState.Active;
        // target, callData, and executed remain at default (address(0), empty, false)

        emit ProposalCreated(proposalId, msg.sender, description, block.timestamp + VOTING_PERIOD);
    }

    /// @notice Create an executable proposal that carries an on-chain action.
    /// If this proposal passes and is executed, it will call
    /// `target.call(callData)`.
    /// @param description Human-readable description of the proposal.
    /// @param target The contract to call if the proposal passes.
    /// @param callData The encoded function call (use abi.encodeWithSignature).
    function createExecutableProposal(
        string calldata description,
        address target,
        bytes calldata callData
    ) external returns (uint256 proposalId) {
        require(votingToken.balanceOf(msg.sender) > 0, "Governance: must hold MIND tokens to propose");
        require(target != address(0), "Governance: target cannot be zero address");

        proposalId = nextProposalId++;
        Proposal storage p = proposals[proposalId];
        p.proposer = msg.sender;
        p.description = description;
        p.votingDeadline = block.timestamp + VOTING_PERIOD;
        p.state = ProposalState.Active;
        p.target = target;
        p.callData = callData;

        emit ProposalCreated(proposalId, msg.sender, description, block.timestamp + VOTING_PERIOD);
    }

    /// @notice Cast a vote on an active proposal. Voting weight equals the
    /// caller's current MIND token balance at the time of voting.
    /// @param support true = vote in favor, false = vote against.
    /// @notice Cast a weighted vote on an active proposal.
    /// @dev SECURITY NOTE (Known Limitation):
    /// This implementation samples live `votingToken.balanceOf(msg.sender)` at the time
    /// the vote is cast. In a production DAO, this should use checkpointed snapshot voting
    /// (e.g. OpenZeppelin ERC20Votes with getPastVotes) to prevent voters from transferring
    /// tokens between wallets to vote multiple times or using flash loans.
    function vote(uint256 proposalId, bool support) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposer != address(0), "Governance: proposal does not exist");
        require(proposal.state == ProposalState.Active, "Governance: proposal is not active");
        require(block.timestamp <= proposal.votingDeadline, "Governance: voting period has ended");
        require(!hasVoted[proposalId][msg.sender], "Governance: already voted");

        uint256 weight = votingToken.balanceOf(msg.sender);
        require(weight > 0, "Governance: must hold MIND tokens to vote");

        hasVoted[proposalId][msg.sender] = true;

        if (support) {
            proposal.votesFor += weight;
        } else {
            proposal.votesAgainst += weight;
        }

        emit VoteCast(proposalId, msg.sender, support, weight);
    }

    /// @notice Finalize a proposal after its voting period has ended,
    /// recording whether it passed (more votesFor than votesAgainst) or failed.
    /// Callable by anyone - it just settles the outcome, it does not act on it.
    /// @dev SECURITY NOTE (Known Limitation):
    /// Currently evaluates simple plurality (`votesFor > votesAgainst`) without a
    /// minimum quorum threshold. Production deployments should enforce a minimum
    /// circulating supply quorum (e.g. 10% participation) to prevent low-turnout takeovers.
    function finalizeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.proposer != address(0), "Governance: proposal does not exist");
        require(proposal.state == ProposalState.Active, "Governance: proposal already finalized");
        require(block.timestamp > proposal.votingDeadline, "Governance: voting period not yet ended");

        proposal.state = proposal.votesFor > proposal.votesAgainst
            ? ProposalState.Passed
            : ProposalState.Failed;

        emit ProposalFinalized(proposalId, proposal.state, proposal.votesFor, proposal.votesAgainst);
    }

    /// @notice Execute a passed proposal's on-chain payload. Permissionless —
    /// the DAO already voted, anyone can trigger the execution.
    /// @dev Only works on proposals that have a non-zero target (executable
    /// proposals). Reverts if the underlying call fails.
    /// @dev SECURITY NOTE (Known Limitation):
    /// Executes immediately upon entering `Passed` state without a timelock delay.
    /// In production, proposals should route through OpenZeppelin TimelockController
    /// to give participants an emergency review window before execution.
    function executeProposal(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(proposal.state == ProposalState.Passed, "Governance: proposal not in Passed state");
        require(!proposal.executed, "Governance: proposal already executed");
        require(proposal.target != address(0), "Governance: proposal has no execution target");

        proposal.executed = true;
        proposal.state = ProposalState.Executed;

        (bool success, ) = proposal.target.call(proposal.callData);
        require(success, "Governance: execution failed");

        emit ProposalExecuted(proposalId, proposal.target, proposal.callData);
    }
}
