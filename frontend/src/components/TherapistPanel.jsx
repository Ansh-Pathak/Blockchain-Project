import { useState, useEffect, useCallback } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { useContract } from "../contracts/useContract";

const STATUS_LABELS = ["Not Applied", "Pending", "Approved", "Rejected"];

export function TherapistPanel({ signer, address }) {
  const contract = useContract("TherapistRegistry", signer);
  const [myStatus, setMyStatus] = useState(0);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminAddress, setAdminAddress] = useState("");
  const [credentialText, setCredentialText] = useState("");
  const [approveAddress, setApproveAddress] = useState("");
  const [transferAddress, setTransferAddress] = useState("");
  const [status, setStatus] = useState("");
  const [isPending, setIsPending] = useState(false);

  const refresh = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const record = await contract.therapists(address);
      setMyStatus(Number(record.status));

      const admin = await contract.admin();
      setAdminAddress(admin);
      setIsAdmin(admin.toLowerCase() === address.toLowerCase());
    } catch (err) {
      console.error("Error refreshing therapist status:", err);
    }
  }, [contract, address]);

  useEffect(() => {
    if (!contract || !address) return;
    refresh();

    // Live updates: if an admin approves/rejects in another tab/account,
    // this panel reflects it immediately without a manual refresh.
    const onApplied = () => refresh();
    const onApproved = () => refresh();
    const onRejected = () => refresh();
    const onTransferred = () => refresh();
    contract.on("TherapistApplied", onApplied);
    contract.on("TherapistApproved", onApproved);
    contract.on("TherapistRejected", onRejected);
    contract.on("AdminTransferred", onTransferred);

    return () => {
      contract.off("TherapistApplied", onApplied);
      contract.off("TherapistApproved", onApproved);
      contract.off("TherapistRejected", onRejected);
      contract.off("AdminTransferred", onTransferred);
    };
  }, [contract, address, refresh]);

  async function handleApply() {
    if (!credentialText.trim()) return;
    setIsPending(true);
    setStatus("Applying... confirm in MetaMask");
    try {
      const credentialHash = keccak256(toUtf8Bytes(credentialText));
      const tx = await contract.applyAsTherapist(credentialHash);
      await tx.wait();
      setStatus("Application submitted!");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  async function handleApprove() {
    if (!approveAddress.trim()) return;
    setIsPending(true);
    setStatus("Approving... confirm in MetaMask");
    try {
      const tx = await contract.approveTherapist(approveAddress);
      await tx.wait();
      setStatus(`Approved ${approveAddress}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  async function handleReject() {
    if (!approveAddress.trim()) return;
    setIsPending(true);
    setStatus("Rejecting... confirm in MetaMask");
    try {
      const tx = await contract.rejectTherapist(approveAddress);
      await tx.wait();
      setStatus(`Rejected ${approveAddress}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  // ── Transfer admin role (typically to the Governance contract) ──
  async function handleTransferAdmin() {
    if (!transferAddress.trim()) return;
    setIsPending(true);
    setStatus("Transferring admin role... confirm in MetaMask");
    try {
      const tx = await contract.transferAdmin(transferAddress);
      await tx.wait();
      setStatus(`Admin role transferred to ${transferAddress}`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="panel">
      <h2>Therapist</h2>
      <p>Your status: <strong>{STATUS_LABELS[myStatus]}</strong></p>
      <p className="admin-info">
        Current admin: <code>{adminAddress.slice(0, 6)}...{adminAddress.slice(-4)}</code>
        {isAdmin && " (you)"}
      </p>

      {myStatus === 0 && (
        <>
          <input
            placeholder="Credential info (only its hash is stored on-chain)"
            value={credentialText}
            onChange={(e) => setCredentialText(e.target.value)}
            disabled={isPending}
          />
          <button disabled={isPending || !credentialText.trim()} onClick={handleApply}>
            {isPending ? "Confirming..." : "Apply as Therapist"}
          </button>
        </>
      )}

      {isAdmin && (
        <div className="admin-box">
          <h3>Admin: Review Applications</h3>
          <input
            placeholder="Applicant wallet address (0x...)"
            value={approveAddress}
            onChange={(e) => setApproveAddress(e.target.value)}
            disabled={isPending}
          />
          <button disabled={isPending} onClick={handleApprove}>Approve</button>
          <button disabled={isPending} onClick={handleReject}>Reject</button>

          <h3>Transfer Admin Role</h3>
          <p className="hint">
            Transfer admin to the Governance contract so therapist approvals are
            handled by DAO vote instead of a single admin. This is irreversible
            from this UI — only the new admin can transfer again.
          </p>
          <input
            placeholder="New admin address (e.g. Governance contract)"
            value={transferAddress}
            onChange={(e) => setTransferAddress(e.target.value)}
            disabled={isPending}
          />
          <button disabled={isPending || !transferAddress.trim()} onClick={handleTransferAdmin}>
            {isPending ? "Confirming..." : "Transfer Admin"}
          </button>
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
