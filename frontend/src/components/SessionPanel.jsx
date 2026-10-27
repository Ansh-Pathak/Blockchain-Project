import { useState, useEffect, useCallback, useMemo } from "react";
import { parseEther, formatEther } from "ethers";
import { useContract } from "../contracts/useContract";
import { SessionChatRoom } from "./SessionChatRoom";

const STATUS_LABELS = ["Requested", "Completed", "Cancelled"];

export function SessionPanel({ signer, address }) {
  const contract = useContract("SessionEscrow", signer);
  const therapistRegistryContract = useContract("TherapistRegistry", signer);

  // Therapist list & selection state
  const [therapists, setTherapists] = useState([
    {
      address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
      name: "Dr. Demo (Licensed Clinical Therapist)",
      isApproved: true,
    },
  ]);
  const [selectedTherapistSelect, setSelectedTherapistSelect] = useState("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  const [customTherapistAddress, setCustomTherapistAddress] = useState("");

  const [fee, setFee] = useState("0.01");
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [timeoutDays, setTimeoutDays] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Chat room state
  const [activeChatSessionId, setActiveChatSessionId] = useState(null);

  // The actual therapist address to book with
  const effectiveTherapistAddress = useMemo(() => {
    if (selectedTherapistSelect === "custom") {
      return customTherapistAddress.trim();
    }
    return selectedTherapistSelect;
  }, [selectedTherapistSelect, customTherapistAddress]);

  // Keep a periodic clock update for timeout checks
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Fetch approved therapists from contract events and verification checks
  useEffect(() => {
    if (!therapistRegistryContract) return;

    let cancelled = false;
    const fetchApprovedTherapists = async () => {
      try {
        const defaultList = [
          {
            address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
            name: "Dr. Demo (Licensed Clinical Therapist)",
            isApproved: true,
          },
        ];

        // Query approval events
        const filter = therapistRegistryContract.filters.TherapistApproved();
        const events = await therapistRegistryContract.queryFilter(filter, 0, "latest");
        const eventAddrs = events.map((e) => e.args[0]);

        const combined = Array.from(
          new Set([...defaultList.map((d) => d.address.toLowerCase()), ...eventAddrs.map((a) => a.toLowerCase())])
        );

        const verified = [];
        for (const addr of combined) {
          const approved = await therapistRegistryContract.isApprovedTherapist(addr);
          if (approved) {
            const matched = defaultList.find((d) => d.address.toLowerCase() === addr.toLowerCase());
            verified.push({
              address: addr,
              name: matched ? matched.name : `Verified Therapist (${addr.slice(0, 6)}...${addr.slice(-4)})`,
              isApproved: true,
            });
          }
        }

        if (!cancelled && verified.length > 0) {
          setTherapists(verified);
        }
      } catch (err) {
        console.warn("Could not query approved therapist events:", err);
      }
    };

    fetchApprovedTherapists();
    return () => {
      cancelled = true;
    };
  }, [therapistRegistryContract]);

  const refreshSessions = useCallback(async () => {
    if (!contract || !address) return;
    try {
      const nextId = await contract.nextSessionId();
      const all = [];
      for (let i = 0; i < Number(nextId); i++) {
        const s = await contract.sessions(i);
        const session = {
          id: i,
          patient: s[0],
          therapist: s[1],
          amount: s[2],
          status: s[3],
          createdAt: s[4],
        };
        if (
          session.patient.toLowerCase() === address.toLowerCase() ||
          session.therapist.toLowerCase() === address.toLowerCase()
        ) {
          all.push(session);
        }
      }
      setSessions(all);
    } catch (err) {
      console.error("Error refreshing sessions:", err);
    }
  }, [contract, address]);

  useEffect(() => {
    if (!contract) return;
    refreshSessions();

    contract.SESSION_TIMEOUT().then((t) => setTimeoutDays(Number(t) / 86400));

    const onChange = () => refreshSessions();
    contract.on("SessionBooked", onChange);
    contract.on("SessionCompleted", onChange);
    contract.on("SessionCancelled", onChange);

    return () => {
      contract.off("SessionBooked", onChange);
      contract.off("SessionCompleted", onChange);
      contract.off("SessionCancelled", onChange);
    };
  }, [contract, refreshSessions]);

  async function handleBook() {
    if (!effectiveTherapistAddress) return;
    setIsBooking(true);
    setStatus("Booking session and securing escrow... please confirm transaction");
    try {
      const tx = await contract.bookSession(effectiveTherapistAddress, { value: parseEther(fee) });
      await tx.wait();
      setStatus("Session successfully booked! Funds held in escrow.");
      refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsBooking(false);
    }
  }

  async function handleConfirm(id) {
    setPendingSessionId(id);
    setStatus(`Confirming session #${id}... releasing escrowed funds and minting MIND tokens`);
    try {
      const tx = await contract.confirmSession(id);
      await tx.wait();
      setStatus(`Session #${id} confirmed! Payment released to therapist & 10 MIND tokens minted.`);
      refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleCancel(id) {
    setPendingSessionId(id);
    setStatus(`Cancelling session #${id}...`);
    try {
      const tx = await contract.cancelSession(id);
      await tx.wait();
      setStatus(`Session #${id} cancelled — full escrow refund issued.`);
      refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleClaimTimeout(id) {
    setPendingSessionId(id);
    setStatus(`Claiming timeout refund for session #${id}...`);
    try {
      const tx = await contract.claimTimeout(id);
      await tx.wait();
      setStatus(`Session #${id} timed out — funds refunded to patient.`);
      refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  function isTimedOut(session) {
    if (!timeoutDays) return false;
    const timeoutSeconds = timeoutDays * 86400;
    return currentTime > Number(session.createdAt) + timeoutSeconds;
  }

  function formatTimeRemaining(session) {
    if (!timeoutDays) return "";
    const timeoutSeconds = timeoutDays * 86400;
    const deadline = Number(session.createdAt) + timeoutSeconds;
    const diff = deadline - currentTime;
    if (diff <= 0) return "Timeout reached";
    const days = Math.floor(diff / 86400);
    const hours = Math.floor((diff % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h until timeout`;
    return `${hours}h until timeout`;
  }

  const activeChatSession = sessions.find((s) => s.id === activeChatSessionId);

  return (
    <div className="panel">
      <h2>Therapy Sessions & Escrow</h2>

      {/* Booking Form with Therapist Dropdown List */}
      <div className="session-booking-card">
        <h3>Book a New Session</h3>
        <p className="panel-subtext">
          Select a verified therapist below. Your session fee is locked in smart-contract escrow and only released upon session confirmation.
        </p>

        <div className="booking-form-grid">
          <div className="form-field">
            <label htmlFor="therapist-dropdown"><strong>Select Verified Therapist:</strong></label>
            <select
              id="therapist-dropdown"
              value={selectedTherapistSelect}
              onChange={(e) => setSelectedTherapistSelect(e.target.value)}
              disabled={isBooking}
            >
              <option value="">-- Choose an Approved Therapist --</option>
              {therapists.map((t) => (
                <option key={t.address} value={t.address}>
                  {t.name} ({t.address.slice(0, 6)}...{t.address.slice(-4)})
                </option>
              ))}
              <option value="custom">✏️ Enter custom therapist address...</option>
            </select>
          </div>

          {selectedTherapistSelect === "custom" && (
            <div className="form-field">
              <label>Custom Therapist Wallet Address:</label>
              <input
                placeholder="Therapist address (0x...)"
                value={customTherapistAddress}
                onChange={(e) => setCustomTherapistAddress(e.target.value)}
                disabled={isBooking}
              />
            </div>
          )}

          <div className="form-field">
            <label>Session Fee (ETH):</label>
            <input
              type="number"
              step="0.005"
              min="0.001"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              disabled={isBooking}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn-book-session"
          disabled={isBooking || !effectiveTherapistAddress}
          onClick={handleBook}
        >
          {isBooking ? "Securing in Escrow..." : `Book Session with Escrow (${fee} ETH)`}
        </button>
      </div>

      {/* Active Consultation Chat Room */}
      {activeChatSession && (
        <SessionChatRoom
          session={activeChatSession}
          currentUserAddress={address}
          onClose={() => setActiveChatSessionId(null)}
        />
      )}

      {/* Session List */}
      <div className="session-list-section">
        <h3>My Consultations</h3>
        {sessions.length === 0 && <p className="empty-notice">No sessions booked yet with this wallet.</p>}

        <div className="sessions-container">
          {sessions.map((s) => {
            const isThisPending = pendingSessionId === s.id;
            const timedOut = isTimedOut(s);
            const isPatient = s.patient.toLowerCase() === address?.toLowerCase();
            const isTherapist = s.therapist.toLowerCase() === address?.toLowerCase();
            const isRequested = Number(s.status) === 0;
            const isChatActive = activeChatSessionId === s.id;

            return (
              <div key={s.id} className={`session-card ${isChatActive ? "card-chat-active" : ""}`}>
                <div className="session-card-header">
                  <div className="session-id-title">
                    <strong>Session #{s.id}</strong>
                    <span className="session-fee-badge">{formatEther(s.amount)} ETH in Escrow</span>
                    <span className={`session-status-tag status-${STATUS_LABELS[Number(s.status)].toLowerCase()}`}>
                      {STATUS_LABELS[Number(s.status)]}
                    </span>
                  </div>

                  {isRequested && (
                    <span className="timeout-tag">⏰ {formatTimeRemaining(s)}</span>
                  )}
                </div>

                <div className="session-card-participants">
                  <div className="participant-line">
                    <span className="part-label">Patient:</span>
                    <code>{s.patient}</code>
                    {isPatient && <span className="part-badge you-badge">You</span>}
                  </div>
                  <div className="participant-line">
                    <span className="part-label">Therapist:</span>
                    <code>{s.therapist}</code>
                    {isTherapist && <span className="part-badge you-badge">You</span>}
                  </div>
                </div>

                <div className="session-card-actions">
                  {/* Dedicated Chat Room Toggle */}
                  <button
                    type="button"
                    className={`btn-session-chat ${isChatActive ? "chat-open" : ""}`}
                    onClick={() => setActiveChatSessionId(isChatActive ? null : s.id)}
                  >
                    💬 {isChatActive ? "Hide Chat Room" : (isRequested ? "Open Consultation Chat" : "View Chat Room (Closed)")}
                  </button>

                  {/* Therapist confirm button */}
                  {isRequested && isTherapist && (
                    <button
                      type="button"
                      className="btn-confirm-session"
                      disabled={isThisPending}
                      onClick={() => handleConfirm(s.id)}
                    >
                      {isThisPending ? "Confirming..." : "✓ Confirm Session (Release Funds & Mint MIND)"}
                    </button>
                  )}

                  {/* Patient cancel button */}
                  {isRequested && isPatient && !timedOut && (
                    <button
                      type="button"
                      className="btn-cancel-session"
                      disabled={isThisPending}
                      onClick={() => handleCancel(s.id)}
                    >
                      {isThisPending ? "Cancelling..." : "Cancel & Refund Escrow"}
                    </button>
                  )}

                  {/* Patient claim timeout refund */}
                  {isRequested && isPatient && timedOut && (
                    <button
                      type="button"
                      className="btn-timeout-session"
                      disabled={isThisPending}
                      onClick={() => handleClaimTimeout(s.id)}
                    >
                      {isThisPending ? "Claiming..." : "⏰ Claim Timeout Refund"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {timeoutDays && (
        <p className="hint">
          🛡️ <strong>Escrow & Safety:</strong> Sessions have an automated {timeoutDays}-day safety timeout. If the therapist is unresponsive, the patient can reclaim 100% of their escrowed funds.
        </p>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}

