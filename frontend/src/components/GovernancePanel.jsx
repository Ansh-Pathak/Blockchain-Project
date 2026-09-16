import { useState, useEffect } from "react";
import { useContract } from "../contracts/useContract";

const STATE_LABELS = ["Active", "Passed", "Failed"];

export function GovernancePanel({ signer, address }) {
  const contract = useContract("MindChainGovernance", signer);
  const [description, setDescription] = useState("");
  const [proposals, setProposals] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!contract) return;
    refreshProposals();
  }, [contract]);

  async function refreshProposals() {
    const nextId = await contract.nextProposalId();
    const all = [];
    for (let i = 0; i < Number(nextId); i++) {
      const p = await contract.proposals(i);
      const voted = address ? await contract.hasVoted(i, address) : false;
      all.push({ id: i, ...p, voted });
    }
    setProposals(all);
  }

  async function handleCreate() {
    if (!description.trim()) return;
    setStatus("Creating proposal... confirm in MetaMask");
    try {
      const tx = await contract.createProposal(description);
      await tx.wait();
      setDescription("");
      setStatus("Proposal created!");
      await refreshProposals();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleVote(id, support) {
    setStatus(`Voting on proposal ${id}...`);
    try {
      const tx = await contract.vote(id, support);
      await tx.wait();
      setStatus(`Voted ${support ? "FOR" : "AGAINST"} proposal ${id}`);
      await refreshProposals();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleFinalize(id) {
    setStatus(`Finalizing proposal ${id}...`);
    try {
      const tx = await contract.finalizeProposal(id);
      await tx.wait();
      setStatus(`Proposal ${id} finalized`);
      await refreshProposals();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
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
      />
      <button onClick={handleCreate}>Create Proposal (requires MIND tokens)</button>

      <h3>Proposals</h3>
      {proposals.length === 0 && <p>No proposals yet.</p>}
      <ul>
        {proposals.map((p) => {
          const deadlinePassed = Date.now() / 1000 > Number(p.votingDeadline);
          return (
            <li key={p.id}>
              <strong>#{p.id}: {p.description}</strong> — {STATE_LABELS[Number(p.state)]}
              <br />
              For: {p.votesFor.toString()} | Against: {p.votesAgainst.toString()}
              <br />
              {Number(p.state) === 0 && !p.voted && !deadlinePassed && (
                <>
                  <button onClick={() => handleVote(p.id, true)}>Vote For</button>
                  <button onClick={() => handleVote(p.id, false)}>Vote Against</button>
                </>
              )}
              {p.voted && <span> (you voted)</span>}
              {Number(p.state) === 0 && deadlinePassed && (
                <button onClick={() => handleFinalize(p.id)}>Finalize</button>
              )}
            </li>
          );
        })}
      </ul>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
