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
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!contract || !address) return;
    refresh();

    // Live updates: if an admin approves/rejects in another tab/account,
    // this panel reflects it immediately without a manual refresh.
    const onApplied = () => refresh();
    const onApproved = () => refresh();
    const onRejected = () => refresh();
    contract.on("TherapistApplied", onApplied);
    contract.on("TherapistApproved", onApproved);
    contract.on("TherapistRejected", onRejected);

    return () => {
      contract.off("TherapistApplied", onApplied);
      contract.off("TherapistApproved", onApproved);
      contract.off("TherapistRejected", onRejected);
    };
  }, [contract, address]);

  async function refresh() {
    const record = await contract.therapists(address);
    setMyStatus(Number(record.status));

    const admin = await contract.admin();
    setIsAdmin(admin.toLowerCase() === address.toLowerCase());
  }

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
        </div>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
