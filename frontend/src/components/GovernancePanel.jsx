import { useState, useEffect } from "react";
import { useContract } from "../contracts/useContract";

const STATE_LABELS = ["Active", "Passed", "Failed"];

export function GovernancePanel({ signer, address }) {
  const contract = useContract("MindChainGovernance", signer);
  const [description, setDescription] = useState("");
  const [proposals, setProposals] = useState([]);
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingProposalId, setPendingProposalId] = useState(null);

  useEffect(() => {
    if (!contract) return;
    refreshProposals();

    // Live updates: a new proposal, a vote, or a finalize by anyone (in
    // another MetaMask account or tab) refreshes this panel automatically.
    const onChange = () => refreshProposals();
    contract.on("ProposalCreated", onChange);
    contract.on("VoteCast", onChange);
    contract.on("ProposalFinalized", onChange);

    return () => {
      contract.off("ProposalCreated", onChange);
      contract.off("VoteCast", onChange);
      contract.off("ProposalFinalized", onChange);
    };
    // `address` is included so that switching MetaMask accounts re-checks
    // "did THIS account vote already" for each proposal, instead of showing
    // stale voting state from whichever account was active before.
  }, [contract, address]);

  async function refreshProposals() {
    const nextId = await contract.nextProposalId();
    const all = [];
    for (let i = 0; i < Number(nextId); i++) {
      const p = await contract.proposals(i);
      const voted = address ? await contract.hasVoted(i, address) : false;
      all.push({
        id: i,
        proposer: p[0],
        description: p[1],
        votesFor: p[2],
        votesAgainst: p[3],
        votingDeadline: p[4],
        state: p[5],
        voted,});
    }
    setProposals(all);
  }

  async function handleCreate() {
    if (!description.trim()) return;
    setIsCreating(true);
    setStatus("Creating proposal... confirm in MetaMask");
    try {
      const tx = await contract.createProposal(description);
      await tx.wait();
      setDescription("");
      setStatus("Proposal created!");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleVote(id, support) {
    setPendingProposalId(id);
    setStatus(`Voting on proposal ${id}...`);
    try {
      const tx = await contract.vote(id, support);
      await tx.wait();
      setStatus(`Voted ${support ? "FOR" : "AGAINST"} proposal ${id}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingProposalId(null);
    }
  }

  async function handleFinalize(id) {
    setPendingProposalId(id);
    setStatus(`Finalizing proposal ${id}...`);
    try {
      const tx = await contract.finalizeProposal(id);
      await tx.wait();
      setStatus(`Proposal ${id} finalized`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingProposalId(null);
    }
  }

  return (
    <div className="panel">
      <h2>DAO Governance</h2>
      <p className="hint">Note: passing a vote records the outcome only - it doesn't automatically take action yet (see README).</p>

      <input
        placeholder="Proposal description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isCreating}
      />
      <button disabled={isCreating || !description.trim()} onClick={handleCreate}>
        {isCreating ? "Confirming..." : "Create Proposal (requires MIND tokens)"}
      </button>

      <h3>Proposals</h3>
      {proposals.length === 0 && <p>No proposals yet.</p>}
      <ul>
        {proposals.map((p) => {
          const deadlinePassed = Date.now() / 1000 > Number(p.votingDeadline);
          const isThisPending = pendingProposalId === p.id;
          return (
            <li key={p.id}>
              <strong>#{p.id}: {p.description}</strong> — {STATE_LABELS[Number(p.state)]}
              <br />
              For: {p.votesFor.toString()} | Against: {p.votesAgainst.toString()}
              <br />
              {Number(p.state) === 0 && !p.voted && !deadlinePassed && (
                <>
                  <button disabled={isThisPending} onClick={() => handleVote(p.id, true)}>
                    {isThisPending ? "Voting..." : "Vote For"}
                  </button>
                  <button disabled={isThisPending} onClick={() => handleVote(p.id, false)}>
                    {isThisPending ? "Voting..." : "Vote Against"}
                  </button>
                </>
              )}
              {p.voted && <span> (you voted)</span>}
              {Number(p.state) === 0 && deadlinePassed && (
                <button disabled={isThisPending} onClick={() => handleFinalize(p.id)}>
                  {isThisPending ? "Finalizing..." : "Finalize"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
