import { useState, useEffect } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { useContract } from "../contracts/useContract";

export function PatientPanel({ signer, address }) {
  const contract = useContract("PatientRegistry", signer);
  const [isRegistered, setIsRegistered] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [entryCount, setEntryCount] = useState(0);
  const [status, setStatus] = useState("");

  // Re-check registration status whenever the contract or address changes
  // (e.g. right after connecting, or after the user registers).
  useEffect(() => {
    if (!contract || !address) return;
    refreshStatus();
  }, [contract, address]);

  async function refreshStatus() {
    const registered = await contract.isRegisteredPatient(address);
    setIsRegistered(registered);
    if (registered) {
      const count = await contract.getJournalEntryCount(address);
      setEntryCount(Number(count));
    }
  }

  async function handleRegister() {
    setStatus("Sending transaction... confirm in MetaMask");
    try {
      const tx = await contract.registerAsPatient();
      await tx.wait(); // wait for the transaction to be mined
      setStatus("Registered!");
      await refreshStatus();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleLogEntry() {
    if (!journalText.trim()) return;
    setStatus("Logging entry... confirm in MetaMask");
    try {
      // We never send the journal text itself to the blockchain - only its
      // hash. keccak256 is the hash function Ethereum uses everywhere.
      // Anyone with the original text can later prove it matches this hash,
      // but the hash alone reveals nothing about the content.
      const contentHash = keccak256(toUtf8Bytes(journalText));
      const tx = await contract.logJournalEntry(contentHash);
      await tx.wait();
      setJournalText("");
      setStatus("Journal entry logged!");
      await refreshStatus();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  return (
    <div className="panel">
      <h2>Patient</h2>
      {!isRegistered ? (
        <button onClick={handleRegister}>Register as Patient</button>
      ) : (
        <>
          <p>✅ Registered. Journal entries logged: {entryCount}</p>
          <textarea
            placeholder="Write a journal entry (only its hash is stored on-chain)"
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
          />
          <button onClick={handleLogEntry}>Log Journal Entry</button>
        </>
      )}
      {status && <p className="status">{status}</p>}
    </div>
  );
}
