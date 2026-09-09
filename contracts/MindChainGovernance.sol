// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @dev Minimal interface for the ERC20 balance check we need for voting weight.
interface IVotingToken {
    function balanceOf(address account) external view returns (uint256);
}

/// @title MindChainGovernance
/// @notice A basic DAO governance contract: any MIND token holder can create
/// a proposal, and token holders vote with weight equal to their token
/// balance. After the voting period ends, anyone can finalize the proposal
/// to record whether it passed or failed.
/// @dev SCOPE NOTE: this contract only handles proposing, voting, and
/// tallying. It does NOT automatically execute the outcome (e.g. a passed
/// "approve this therapist" proposal does not automatically call
/// TherapistRegistry.approveTherapist). Auto-execution, quorum rules, and
/// timelocks are planned as Phase 2 - see project README.
contract MindChainGovernance {
    enum ProposalState {
        Active,
        Passed,
        Failed
    }

    struct Proposal {
        address proposer;
        string description;
        uint256 votesFor;
        uint256 votesAgainst;
        uint256 votingDeadline;
        ProposalState state;
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

    constructor(address votingTokenAddress) {
        votingToken = IVotingToken(votingTokenAddress);
    }

    /// @notice Create a new proposal. Requires holding at least 1 MIND token,
    /// so only participants who've actually completed sessions can propose.
    function createProposal(string calldata description) external returns (uint256 proposalId) {
        require(votingToken.balanceOf(msg.sender) > 0, "Governance: must hold MIND tokens to propose");

        proposalId = nextProposalId++;
        proposals[proposalId] = Proposal({
            proposer: msg.sender,
            description: description,
            votesFor: 0,
            votesAgainst: 0,
            votingDeadline: block.timestamp + VOTING_PERIOD,
            state: ProposalState.Active
        });

        emit ProposalCreated(proposalId, msg.sender, description, block.timestamp + VOTING_PERIOD);
    }

    /// @notice Cast a vote on an active proposal. Voting weight equals the
    /// caller's current MIND token balance at the time of voting.
    /// @param support true = vote in favor, false = vote against.
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
}
