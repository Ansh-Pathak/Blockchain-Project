import { useState, useEffect } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { useContract } from "../contracts/useContract";

export function PatientPanel({ signer, address }) {
  const contract = useContract("PatientRegistry", signer);
  const [isRegistered, setIsRegistered] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [entryCount, setEntryCount] = useState(0);
  const [status, setStatus] = useState("");
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    if (!contract || !address) return;
    refreshStatus();

    // Listen for the contract's own events instead of only refreshing after
    // our own transactions. This means if you have the app open in two
    // browser tabs (one per role) or run demo-seed.js while it's open, the
    // UI updates live without any manual refresh.
    const onRegistered = (registeredAddress) => {
      if (registeredAddress.toLowerCase() === address.toLowerCase()) refreshStatus();
    };
    const onEntryLogged = (loggedAddress) => {
      if (loggedAddress.toLowerCase() === address.toLowerCase()) refreshStatus();
    };
    contract.on("PatientRegistered", onRegistered);
    contract.on("JournalEntryLogged", onEntryLogged);

    return () => {
      contract.off("PatientRegistered", onRegistered);
      contract.off("JournalEntryLogged", onEntryLogged);
    };
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
    setIsPending(true);
    setStatus("Sending transaction... confirm in MetaMask");
    try {
      const tx = await contract.registerAsPatient();
      await tx.wait();
      setStatus("Registered!");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  async function handleLogEntry() {
    if (!journalText.trim()) return;
    setIsPending(true);
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
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="panel">
      <h2>Patient</h2>
      {!isRegistered ? (
        <button disabled={isPending} onClick={handleRegister}>
          {isPending ? "Confirming..." : "Register as Patient"}
        </button>
      ) : (
        <>
          <p>✅ Registered. Journal entries logged: {entryCount}</p>
          <textarea
            placeholder="Write a journal entry (only its hash is stored on-chain)"
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            disabled={isPending}
          />
          <button disabled={isPending || !journalText.trim()} onClick={handleLogEntry}>
            {isPending ? "Confirming..." : "Log Journal Entry"}
          </button>
        </>
      )}
      {status && <p className="status">{status}</p>}
    </div>
  );
}
