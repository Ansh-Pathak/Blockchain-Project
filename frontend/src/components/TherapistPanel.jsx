import { useState, useEffect } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { useContract } from "../contracts/useContract";

const STATUS_LABELS = ["Not Applied", "Pending", "Approved", "Rejected"];

export function TherapistPanel({ signer, address }) {
  const contract = useContract("TherapistRegistry", signer);
  const [myStatus, setMyStatus] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [credentialText, setCredentialText] = useState("");
  const [approveAddress, setApproveAddress] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!contract || !address) return;
    refresh();
  }, [contract, address]);

  async function refresh() {
    const record = await contract.therapists(address);
    setMyStatus(Number(record.status));

    const admin = await contract.admin();
    setIsAdmin(admin.toLowerCase() === address.toLowerCase());
  }

  async function handleApply() {
    if (!credentialText.trim()) return;
    setStatus("Applying... confirm in MetaMask");
    try {
      const credentialHash = keccak256(toUtf8Bytes(credentialText));
      const tx = await contract.applyAsTherapist(credentialHash);
      await tx.wait();
      setStatus("Application submitted!");
      await refresh();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleApprove() {
    setStatus("Approving... confirm in MetaMask");
    try {
      const tx = await contract.approveTherapist(approveAddress);
      await tx.wait();
      setStatus(`Approved ${approveAddress}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleReject() {
    setStatus("Rejecting... confirm in MetaMask");
    try {
      const tx = await contract.rejectTherapist(approveAddress);
      await tx.wait();
      setStatus(`Rejected ${approveAddress}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  return (
    <div className="panel">
      <h2>Therapist</h2>
      <p>Your status: <strong>{STATUS_LABELS[myStatus]}</strong></p>

      {myStatus === 0 && (
        <>
          <input
            placeholder="Credential info (only its hash is stored on-chain)"
            value={credentialText}
            onChange={(e) => setCredentialText(e.target.value)}
          />
          <button onClick={handleApply}>Apply as Therapist</button>
        </>
      )}

      {isAdmin && (
        <div className="admin-box">
          <h3>Admin: Review Applications</h3>
          <input
            placeholder="Applicant wallet address (0x...)"
            value={approveAddress}
            onChange={(e) => setApproveAddress(e.target.value)}
          />
          <button onClick={handleApprove}>Approve</button>
          <button onClick={handleReject}>Reject</button>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
