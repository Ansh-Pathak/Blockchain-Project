import { useState, useEffect, useCallback } from "react";
import { useContract } from "../contracts/useContract";
import { CONTRACT_ADDRESSES } from "../contracts/addresses";
import { Interface } from "ethers";

const STATE_LABELS = ["Active", "Passed", "Failed", "Executed"];

export function GovernancePanel({ signer, address }) {
  const contract = useContract("MindChainGovernance", signer);
  const [description, setDescription] = useState("");
  const [proposals, setProposals] = useState([]);
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [pendingProposalId, setPendingProposalId] = useState(null);

  // ── Executable proposal fields ──
  const [showExecutable, setShowExecutable] = useState(false);
  const [execTarget, setExecTarget] = useState("");
  const [execTherapistAddr, setExecTherapistAddr] = useState("");

  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Periodic clock update for proposal deadlines
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const refreshProposals = useCallback(async () => {
    if (!contract) return;
    try {
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
          target: p[6],
          callData: p[7],
          executed: p[8],
          voted,
        });
      }
      setProposals(all);
    } catch (err) {
      console.error("Error refreshing proposals:", err);
    }
  }, [contract, address]);

  useEffect(() => {
    if (!contract) return;
    refreshProposals();

    // Live updates: a new proposal, a vote, finalize, or execution by anyone
    // (in another MetaMask account or tab) refreshes this panel automatically.
    const onChange = () => refreshProposals();
    contract.on("ProposalCreated", onChange);
    contract.on("VoteCast", onChange);
    contract.on("ProposalFinalized", onChange);
    contract.on("ProposalExecuted", onChange);

    return () => {
      contract.off("ProposalCreated", onChange);
      contract.off("VoteCast", onChange);
      contract.off("ProposalFinalized", onChange);
      contract.off("ProposalExecuted", onChange);
    };
  }, [contract, refreshProposals]);

  // ── Create a simple (non-executable) proposal ──
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

  // ── Create an executable proposal (carries an on-chain action) ──
  async function handleCreateExecutable() {
    if (!description.trim() || !execTarget.trim() || !execTherapistAddr.trim()) return;
    setIsCreating(true);
    setStatus("Creating executable proposal... confirm in MetaMask");
    try {
      // Encode the callData: approveTherapist(address)
      const iface = new Interface(["function approveTherapist(address)"]);
      const callData = iface.encodeFunctionData("approveTherapist", [execTherapistAddr]);

      const tx = await contract.createExecutableProposal(description, execTarget, callData);
      await tx.wait();
      setDescription("");
      setExecTarget("");
      setExecTherapistAddr("");
      setShowExecutable(false);
      setStatus("Executable proposal created!");
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

  // ── Execute a passed proposal ──
  async function handleExecute(id) {
    setPendingProposalId(id);
    setStatus(`Executing proposal ${id}...`);
    try {
      const tx = await contract.executeProposal(id);
      await tx.wait();
      setStatus(`Proposal ${id} executed on-chain!`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingProposalId(null);
    }
  }

  // Pre-fill the TherapistRegistry address for convenience
  function handleToggleExecutable() {
    setShowExecutable(!showExecutable);
    if (!showExecutable && CONTRACT_ADDRESSES.TherapistRegistry) {
      setExecTarget(CONTRACT_ADDRESSES.TherapistRegistry);
    }
  }

  return (
    <div className="panel">
      <h2>DAO Governance</h2>

      <input
        placeholder="Proposal description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        disabled={isCreating}
      />

      {/* Toggle between simple and executable proposal modes */}
      {!showExecutable ? (
        <>
          <button disabled={isCreating || !description.trim()} onClick={handleCreate}>
            {isCreating ? "Confirming..." : "Create Proposal (requires MIND tokens)"}
          </button>
          <button
            className="secondary-btn"
            onClick={handleToggleExecutable}
            disabled={isCreating}
          >
            ▶ Create Executable Proposal (auto-approve therapist)
          </button>
        </>
      ) : (
        <div className="exec-form">
          <p className="hint">
            An executable proposal carries an on-chain action. When it passes and
            is executed, it will call the target contract automatically — e.g. to
            approve a therapist via DAO vote instead of admin approval.
          </p>
          <input
            placeholder="Target contract address (TherapistRegistry)"
            value={execTarget}
            onChange={(e) => setExecTarget(e.target.value)}
            disabled={isCreating}
          />
          <input
            placeholder="Therapist address to approve (0x...)"
            value={execTherapistAddr}
            onChange={(e) => setExecTherapistAddr(e.target.value)}
            disabled={isCreating}
          />
          <button
            disabled={isCreating || !description.trim() || !execTarget.trim() || !execTherapistAddr.trim()}
            onClick={handleCreateExecutable}
          >
            {isCreating ? "Confirming..." : "Create Executable Proposal"}
          </button>
          <button className="secondary-btn" onClick={() => setShowExecutable(false)} disabled={isCreating}>
            ← Back to simple proposal
          </button>
        </div>
      )}

      <h3>Proposals</h3>
      {proposals.length === 0 && <p>No proposals yet.</p>}
      <ul>
        {proposals.map((p) => {
          const deadlinePassed = currentTime > Number(p.votingDeadline);
          const isThisPending = pendingProposalId === p.id;
          const isExecutable = p.target && p.target !== "0x0000000000000000000000000000000000000000";
          const isPassed = Number(p.state) === 1;
          const isExecuted = Number(p.state) === 3;
          return (
            <li key={p.id}>
              <strong>#{p.id}: {p.description}</strong> — {STATE_LABELS[Number(p.state)]}
              {isExecutable && <span className="badge executable">⚙ Executable</span>}
              {isExecuted && <span className="badge executed">✓ Executed</span>}
              <br />
              For: {p.votesFor.toString()} | Against: {p.votesAgainst.toString()}
              <br />
              {/* Vote buttons — only if Active, not yet voted, and deadline not passed */}
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
              {/* Finalize button — only if Active and deadline passed */}
              {Number(p.state) === 0 && deadlinePassed && (
                <button disabled={isThisPending} onClick={() => handleFinalize(p.id)}>
                  {isThisPending ? "Finalizing..." : "Finalize"}
                </button>
              )}
              {/* Execute button — only if Passed and executable */}
              {isPassed && isExecutable && (
                <button disabled={isThisPending} onClick={() => handleExecute(p.id)}>
                  {isThisPending ? "Executing..." : "⚡ Execute On-Chain"}
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
