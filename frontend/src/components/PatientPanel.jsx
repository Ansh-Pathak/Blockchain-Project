import { useState, useEffect, useCallback } from "react";
import { keccak256, toUtf8Bytes } from "ethers";
import { useContract } from "../contracts/useContract";
import { useAnonymousIdentity } from "../hooks/useAnonymousIdentity";
import { useIPFS } from "../hooks/useIPFS";
import { encryptJournal, decryptJournal } from "../utils/cryptoUtils";
import { Group } from "@semaphore-protocol/group";
import { generateProof } from "@semaphore-protocol/proof";

export function PatientPanel({ signer, address }) {
  const contract = useContract("PatientRegistry", signer);
  const anonContract = useContract("AnonymousPatientRegistry", signer);
  const { uploadToIPFS, fetchFromIPFS } = useIPFS();

  // Normal registry state
  const [isRegistered, setIsRegistered] = useState(false);
  const [journalText, setJournalText] = useState("");
  const [entryCount, setEntryCount] = useState(0);

  // ZK Anonymous Identity state
  const { identity, commitment, hasIdentity, createIdentity, resetIdentity } = useAnonymousIdentity(address);
  const [hasJoinedGroup, setHasJoinedGroup] = useState(false);
  const [anonJournalText, setAnonJournalText] = useState("");
  const [anonEntryCount, setAnonEntryCount] = useState(0);
  const [anonEntries, setAnonEntries] = useState([]);

  // Encryption key options
  const [customPassphrase, setCustomPassphrase] = useState("");
  const [useCustomPassphrase, setUseCustomPassphrase] = useState(false);

  // Decryption state for viewer
  const [decryptedEntries, setDecryptedEntries] = useState({});
  const [decryptErrors, setDecryptErrors] = useState({});
  const [decryptingCids, setDecryptingCids] = useState({});

  // UI state
  const [status, setStatus] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [zkStep, setZkStep] = useState("");

  // Resolves the secret encryption key to use (ZK identity secret or passphrase)
  const getEncryptionSecret = useCallback(() => {
    if (useCustomPassphrase && customPassphrase.trim()) {
      return customPassphrase.trim();
    }
    if (identity && identity.secretScalar) {
      return identity.secretScalar.toString();
    }
    return address ? address.toLowerCase() : "mindchain-default-key";
  }, [useCustomPassphrase, customPassphrase, identity, address]);

  // Refresh normal patient registry status
  const refreshStatus = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const registered = await contract.isRegisteredPatient(address);
      setIsRegistered(registered);
      if (registered) {
        const count = await contract.getJournalEntryCount(address);
        setEntryCount(Number(count));
      }
    } catch (err) {
      console.error("Error refreshing patient status:", err);
    }
  }, [contract, address]);

  // Refresh anonymous group membership and entries
  const refreshAnonState = useCallback(async () => {
    if (!anonContract || !address) return;
    try {
      const joined = await anonContract.hasJoinedGroup(address);
      setHasJoinedGroup(joined);

      const count = await anonContract.getAnonymousJournalCount();
      setAnonEntryCount(Number(count));

      // Fetch anonymous journal events from block 0
      const filter = anonContract.filters.AnonymousJournalLogged();
      const events = await anonContract.queryFilter(filter, 0, "latest");

      const parsed = events.map((ev, idx) => {
        const hash = ev.args.contentHash;
        const savedCid = localStorage.getItem(`mindchain_cid_for_${hash}`);
        const localSavedText = localStorage.getItem(`mindchain_anon_note_${hash}`);

        return {
          id: `${hash}-${idx}`,
          contentHash: hash,
          cid: savedCid || null,
          nullifier: ev.args.nullifierHash ? ev.args.nullifierHash.toString() : "",
          timestamp: ev.args.timestamp ? Number(ev.args.timestamp) : 0,
          localText: localSavedText || null,
        };
      });

      // Show newest first
      parsed.reverse();
      setAnonEntries(parsed);
    } catch (err) {
      console.error("Error refreshing anonymous state:", err);
    }
  }, [anonContract, address]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    refreshAnonState();
  }, [refreshAnonState]);

  // Event listeners for live updates
  useEffect(() => {
    if (!contract || !address) return;
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
  }, [contract, address, refreshStatus]);

  useEffect(() => {
    if (!anonContract || !address) return;
    const onJoined = (patientAddr) => {
      if (patientAddr.toLowerCase() === address.toLowerCase()) {
        refreshAnonState();
      }
    };
    const onAnonLogged = () => {
      refreshAnonState();
    };

    anonContract.on("PatientJoinedGroup", onJoined);
    anonContract.on("AnonymousJournalLogged", onAnonLogged);

    return () => {
      anonContract.off("PatientJoinedGroup", onJoined);
      anonContract.off("AnonymousJournalLogged", onAnonLogged);
    };
  }, [anonContract, address, refreshAnonState]);

  // Register as patient
  async function handleRegister() {
    setIsPending(true);
    setStatus("Registering as patient... Confirm in MetaMask");
    try {
      const tx = await contract.registerAsPatient();
      await tx.wait();
      setStatus("Successfully registered as patient!");
      await refreshStatus();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  // Standard public journal logging with client-side encryption + IPFS
  async function handleLogEntry() {
    if (!journalText.trim()) return;
    setIsPending(true);
    setStatus("Encrypting entry client-side (AES-GCM 256)...");

    try {
      const secret = getEncryptionSecret();
      const encrypted = await encryptJournal(journalText.trim(), secret);

      setStatus("Uploading encrypted ciphertext to IPFS...");
      const { cid } = await uploadToIPFS(encrypted);

      setStatus("Storing CID hash on-chain... Confirm in MetaMask");
      const contentHash = keccak256(toUtf8Bytes(cid));

      const tx = await contract.logJournalEntry(contentHash);
      await tx.wait();

      localStorage.setItem(`mindchain_cid_for_${contentHash}`, cid);
      setJournalText("");
      setStatus(`Journal entry encrypted, pinned to IPFS (${cid.slice(0, 10)}...), and hash logged on-chain!`);
      await refreshStatus();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  // Join the ZK anonymous group
  async function handleJoinAnonGroup() {
    if (!identity) {
      setStatus("Please generate a ZK identity first.");
      return;
    }
    setIsPending(true);
    setStatus("Joining ZK Anonymous Group... Confirm in MetaMask");
    try {
      const commitmentBigInt = BigInt(commitment);
      const tx = await anonContract.joinAnonymousGroup(commitmentBigInt);
      await tx.wait();
      setStatus("Successfully joined anonymous group!");
      setHasJoinedGroup(true);
      await refreshAnonState();
    } catch (err) {
      setStatus("Error joining group: " + (err.reason || err.message));
    } finally {
      setIsPending(false);
    }
  }

  // Submit anonymous journal entry with IPFS encryption + ZK proof
  async function handleLogAnonymousEntry() {
    if (!anonJournalText.trim()) return;
    if (!identity) {
      setStatus("Error: No ZK identity found.");
      return;
    }

    setIsPending(true);
    setZkStep("Encrypting journal text client-side (AES-GCM 256)...");
    setStatus("Encrypting journal entry...");

    try {
      const trimmedText = anonJournalText.trim();
      const secret = getEncryptionSecret();

      // 1. Client-side encryption
      const encryptedEnvelope = await encryptJournal(trimmedText, secret);

      // 2. Upload encrypted payload to IPFS and obtain CID
      setZkStep("Storing encrypted envelope on IPFS decentralized storage...");
      const { cid } = await uploadToIPFS(encryptedEnvelope);

      // 3. Compute content hash from the IPFS CID
      const contentHash = keccak256(toUtf8Bytes(cid));
      const contentHashUint = BigInt(contentHash);

      // 4. Fetch all group members from on-chain events
      setZkStep("Rebuilding on-chain Semaphore Merkle tree from patient commitments...");
      const filter = anonContract.filters.PatientJoinedGroup();
      const events = await anonContract.queryFilter(filter, 0, "latest");

      const group = new Group();
      for (const ev of events) {
        group.addMember(BigInt(ev.args.identityCommitment));
      }

      if (group.indexOf(identity.commitment) === -1) {
        throw new Error(
          "Your current identity commitment is not found in the on-chain group. " +
          "If you joined using a different browser/identity, that identity must be restored."
        );
      }

      // 5. Generate Groth16 ZK proof
      setZkStep("Generating ZK Snark Proof (proving membership without revealing address)...");
      setStatus("Generating ZK Proof in browser (~3-5 seconds)...");

      const proof = await generateProof(
        identity,
        group,
        contentHashUint, // message
        contentHashUint  // scope
      );

      const semaphoreProof = {
        merkleTreeDepth: proof.merkleTreeDepth,
        merkleTreeRoot: proof.merkleTreeRoot,
        nullifier: proof.nullifier,
        message: proof.message,
        scope: proof.scope,
        points: proof.points,
      };

      // 6. Submit transaction on-chain
      setZkStep("Submitting ZK proof to AnonymousPatientRegistry... Confirm in MetaMask");
      setStatus("Confirm transaction in MetaMask...");

      const tx = await anonContract.logAnonymousJournal(contentHash, semaphoreProof);
      await tx.wait();

      // Associate CID and local note with the content hash for instant decryption
      localStorage.setItem(`mindchain_cid_for_${contentHash}`, cid);
      localStorage.setItem(`mindchain_anon_note_${contentHash}`, trimmedText);

      setAnonJournalText("");
      setStatus("Anonymous entry encrypted, uploaded to IPFS, and verified on-chain via ZK proof!");
      setZkStep("");
      await refreshAnonState();
    } catch (err) {
      console.error("ZK Proof error:", err);
      setStatus("Error: " + (err.reason || err.message));
      setZkStep("");
    } finally {
      setIsPending(false);
    }
  }

  // Decrypt an entry from IPFS using the viewer
  async function handleDecryptEntry(entry) {
    const entryId = entry.id;
    if (decryptedEntries[entryId]) {
      // Toggle hide
      setDecryptedEntries((prev) => {
        const copy = { ...prev };
        delete copy[entryId];
        return copy;
      });
      return;
    }

    setDecryptingCids((prev) => ({ ...prev, [entryId]: true }));
    setDecryptErrors((prev) => ({ ...prev, [entryId]: null }));

    try {
      // 1. If we have the local plain text cached, display directly
      if (entry.localText) {
        setDecryptedEntries((prev) => ({ ...prev, [entryId]: entry.localText }));
        return;
      }

      // 2. Otherwise download encrypted payload from IPFS
      if (!entry.cid) {
        throw new Error("No IPFS CID found for this content hash.");
      }

      const envelope = await fetchFromIPFS(entry.cid);
      const secret = getEncryptionSecret();
      const plainText = await decryptJournal(envelope, secret);

      setDecryptedEntries((prev) => ({ ...prev, [entryId]: plainText }));
    } catch (err) {
      console.error("Decryption failed:", err);
      setDecryptErrors((prev) => ({
        ...prev,
        [entryId]: "Decryption failed (content is private to its author).",
      }));
    } finally {
      setDecryptingCids((prev) => ({ ...prev, [entryId]: false }));
    }
  }

  return (
    <div className="panel patient-panel">
      <h2>Patient Portal</h2>

      {!isRegistered ? (
        <div className="registration-box">
          <p>You must register as a patient before accessing records or joining the anonymous pool.</p>
          <button disabled={isPending} onClick={handleRegister}>
            {isPending ? "Confirming..." : "Register as Patient"}
          </button>
        </div>
      ) : (
        <>
          <div className="patient-status-badge">
            <span>✅ Registered Patient</span>
            <span className="entry-counter">{entryCount} public entries logged</span>
          </div>

          {/* Standard Journal Section */}
          <div className="standard-journal-section">
            <h3>Standard Journal (Encrypted &amp; Pinned to IPFS)</h3>
            <p className="section-desc">
              Entries are encrypted client-side using AES-GCM 256-bit, uploaded to decentralized IPFS storage,
              and only the immutable cryptographic CID hash is recorded on-chain.
            </p>
            <textarea
              placeholder="Write a personal journal entry..."
              value={journalText}
              onChange={(e) => setJournalText(e.target.value)}
              disabled={isPending}
            />
            <button disabled={isPending || !journalText.trim()} onClick={handleLogEntry}>
              {isPending ? "Encrypting & Confirming..." : "Encrypt, Pin to IPFS & Log On-Chain"}
            </button>
          </div>

          {/* ZK Anonymous Journaling Section */}
          <div className="anon-section">
            <div className="anon-header">
              <h3>🔒 Zero-Knowledge Anonymous Journaling</h3>
              <span className="zk-pill">Semaphore ZK-SNARK</span>
            </div>
            <p className="section-desc">
              Prove you are a registered patient and record an encrypted journal entry{" "}
              <strong>without revealing your wallet address or identity</strong>.
            </p>

            {/* Step 1: Manage ZK Identity */}
            <div className="zk-identity-box">
              <div className="zk-identity-info">
                <strong>ZK Cryptographic Identity:</strong>{" "}
                {hasIdentity ? (
                  <span className="status-ready">Generated &amp; Stored Locally</span>
                ) : (
                  <span className="status-missing">No local ZK identity found</span>
                )}
              </div>

              {hasIdentity ? (
                <div className="commitment-preview">
                  <span className="label">Identity Commitment:</span>
                  <code>{commitment ? `${commitment.slice(0, 10)}...${commitment.slice(-8)}` : ""}</code>
                  <button
                    type="button"
                    className="small-btn danger-btn"
                    disabled={isPending}
                    onClick={() => {
                      if (confirm("Reset local ZK identity? If you already joined the group, you will lose ability to prove from this identity.")) {
                        resetIdentity();
                      }
                    }}
                  >
                    Reset Identity
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="secondary-btn"
                  disabled={isPending}
                  onClick={() => createIdentity()}
                >
                  Generate Cryptographic ZK Identity
                </button>
              )}
            </div>

            {/* Step 2: Join Group if not joined */}
            <div className="zk-membership-box">
              <div className="zk-membership-status">
                <strong>On-Chain Group Membership:</strong>{" "}
                {hasJoinedGroup ? (
                  <span className="status-joined">✅ Active Group Member</span>
                ) : (
                  <span className="status-not-joined">Not yet joined</span>
                )}
              </div>

              {!hasJoinedGroup && (
                <div className="join-action">
                  <p className="hint">
                    Joining adds your ZK identity commitment to the on-chain Semaphore Merkle tree.
                    Your patient wallet address is verified once, but future ZK proofs cannot be linked to it.
                  </p>
                  <button
                    disabled={isPending || !hasIdentity}
                    onClick={handleJoinAnonGroup}
                  >
                    {isPending ? "Confirming..." : "Join Anonymous Group On-Chain"}
                  </button>
                </div>
              )}
            </div>

            {/* Step 3: Anonymous Journal Entry Form */}
            {hasJoinedGroup && (
              <div className="zk-journal-form">
                <h4>Log Anonymous Entry (IPFS Encrypted + ZK Proved)</h4>
                <textarea
                  placeholder="Share your thoughts anonymously... Your entry is encrypted with AES-GCM before uploading to IPFS, and verified via ZK-SNARK."
                  value={anonJournalText}
                  onChange={(e) => setAnonJournalText(e.target.value)}
                  disabled={isPending}
                />

                <div className="encryption-options">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={useCustomPassphrase}
                      onChange={(e) => setUseCustomPassphrase(e.target.checked)}
                    />
                    Use custom encryption passphrase (default: derived from ZK secret key)
                  </label>
                  {useCustomPassphrase && (
                    <input
                      type="password"
                      placeholder="Enter private decryption passphrase"
                      value={customPassphrase}
                      onChange={(e) => setCustomPassphrase(e.target.value)}
                    />
                  )}
                </div>

                <button
                  className="zk-submit-btn"
                  disabled={isPending || !anonJournalText.trim()}
                  onClick={handleLogAnonymousEntry}
                >
                  {isPending ? "Processing ZK Proof & IPFS..." : "Encrypt, Pin to IPFS & Submit ZK Proof"}
                </button>

                {zkStep && <div className="zk-step-indicator">⚡ {zkStep}</div>}
              </div>
            )}

            {/* Step 4: Feed of anonymous entries & IPFS decryptor */}
            <div className="anon-feed-section">
              <h4>
                Verified Anonymous Entries On-Chain ({anonEntryCount})
              </h4>
              {anonEntries.length === 0 ? (
                <p className="empty-feed">No anonymous journal entries recorded yet.</p>
              ) : (
                <div className="anon-entries-list">
                  {anonEntries.map((item) => (
                    <div key={item.id} className="anon-entry-card">
                      <div className="anon-entry-top">
                        <span className="anon-badge">🔒 ZK Verified</span>
                        {item.timestamp > 0 && (
                          <span className="anon-time">
                            {new Date(item.timestamp * 1000).toLocaleString()}
                          </span>
                        )}
                      </div>

                      <div className="anon-hashes">
                        <div>
                          <span className="hash-label">Content Hash:</span>
                          <code>{item.contentHash.slice(0, 14)}...{item.contentHash.slice(-8)}</code>
                        </div>
                        {item.cid && (
                          <div>
                            <span className="hash-label">IPFS CID:</span>
                            <a
                              href={`https://ipfs.io/ipfs/${item.cid}`}
                              target="_blank"
                              rel="noreferrer"
                              className="ipfs-link"
                            >
                              <code>{item.cid.slice(0, 12)}...{item.cid.slice(-6)}</code> ↗
                            </a>
                          </div>
                        )}
                        {item.nullifier && (
                          <div>
                            <span className="hash-label">Nullifier:</span>
                            <code>{item.nullifier.slice(0, 10)}...{item.nullifier.slice(-6)}</code>
                          </div>
                        )}
                      </div>

                      <div className="viewer-actions">
                        <button
                          type="button"
                          className="small-btn decrypt-btn"
                          disabled={decryptingCids[item.id]}
                          onClick={() => handleDecryptEntry(item)}
                        >
                          {decryptingCids[item.id]
                            ? "Fetching & Decrypting..."
                            : decryptedEntries[item.id]
                            ? "Hide Decrypted Note"
                            : "Decrypt & View Note"}
                        </button>
                      </div>

                      {decryptedEntries[item.id] && (
                        <div className="decrypted-box">
                          <span className="decrypted-tag">🔓 Decrypted Journal Text (AES-GCM):</span>
                          <p className="decrypted-text">{decryptedEntries[item.id]}</p>
                        </div>
                      )}

                      {decryptErrors[item.id] && (
                        <div className="decrypt-error">
                          ⚠️ {decryptErrors[item.id]}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
