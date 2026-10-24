import { useState, useEffect, useCallback } from "react";
import { parseEther, formatEther } from "ethers";
import { useContract } from "../contracts/useContract";

const STATUS_LABELS = ["Requested", "Completed", "Cancelled"];

export function SessionPanel({ signer, address }) {
  const contract = useContract("SessionEscrow", signer);
  const [therapistAddress, setTherapistAddress] = useState("");
  const [fee, setFee] = useState("0.01");
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState("");
  const [isBooking, setIsBooking] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState(null);
  const [timeoutDays, setTimeoutDays] = useState(null);
  const [currentTime, setCurrentTime] = useState(() => Math.floor(Date.now() / 1000));

  // Keep a periodic clock update for timeout checks
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Math.floor(Date.now() / 1000));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

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

    // Read the timeout constant once so we can show it in the UI.
    contract.SESSION_TIMEOUT().then((t) => setTimeoutDays(Number(t) / 86400));

    // Any booking/completion/cancellation - by us or by whoever we're
    // paired with in the demo - refreshes the list live.
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
    if (!therapistAddress.trim()) return;
    setIsBooking(true);
    setStatus("Booking session... confirm in MetaMask");
    try {
      const tx = await contract.bookSession(therapistAddress, { value: parseEther(fee) });
      await tx.wait();
      setStatus("Session booked!");
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setIsBooking(false);
    }
  }

  async function handleConfirm(id) {
    setPendingSessionId(id);
    setStatus(`Confirming session ${id}...`);
    try {
      const tx = await contract.confirmSession(id);
      await tx.wait();
      setStatus(`Session ${id} confirmed - payment + reward sent`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  async function handleCancel(id) {
    setPendingSessionId(id);
    setStatus(`Cancelling session ${id}...`);
    try {
      const tx = await contract.cancelSession(id);
      await tx.wait();
      setStatus(`Session ${id} cancelled - refunded`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  // ── Claim timeout: patient reclaims funds if therapist hasn't confirmed ──
  async function handleClaimTimeout(id) {
    setPendingSessionId(id);
    setStatus(`Claiming timeout refund for session ${id}...`);
    try {
      const tx = await contract.claimTimeout(id);
      await tx.wait();
      setStatus(`Session ${id} timed out - funds refunded to patient`);
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    } finally {
      setPendingSessionId(null);
    }
  }

  // Check if a session has exceeded the timeout period
  function isTimedOut(session) {
    if (!timeoutDays) return false;
    const timeoutSeconds = timeoutDays * 86400;
    return currentTime > Number(session.createdAt) + timeoutSeconds;
  }

  // Format how long until/since timeout for display
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

  return (
    <div className="panel">
      <h2>Sessions</h2>
      <div>
        <input
          placeholder="Therapist wallet address (0x...)"
          value={therapistAddress}
          onChange={(e) => setTherapistAddress(e.target.value)}
          disabled={isBooking}
        />
        <input
          type="number"
          step="0.001"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          disabled={isBooking}
        />
        <button disabled={isBooking || !therapistAddress.trim()} onClick={handleBook}>
          {isBooking ? "Confirming..." : "Book Session (pay fee in ETH)"}
        </button>
      </div>

      <h3>My Sessions</h3>
      {sessions.length === 0 && <p>No sessions yet.</p>}
      <ul>
        {sessions.map((s) => {
          const isThisPending = pendingSessionId === s.id;
          const timedOut = isTimedOut(s);
          const isPatient = s.patient.toLowerCase() === address?.toLowerCase();
          const isTherapist = s.therapist.toLowerCase() === address?.toLowerCase();
          return (
            <li key={s.id}>
              #{s.id} — {formatEther(s.amount)} ETH — {STATUS_LABELS[Number(s.status)]}
              {/* Show timeout info for Requested sessions */}
              {Number(s.status) === 0 && (
                <span className="timeout-info"> ({formatTimeRemaining(s)})</span>
              )}
              {" "}
              {/* Therapist confirm button */}
              {Number(s.status) === 0 && isTherapist && (
                <button disabled={isThisPending} onClick={() => handleConfirm(s.id)}>
                  {isThisPending ? "Confirming..." : "Confirm (I'm the therapist)"}
                </button>
              )}
              {/* Patient cancel button — only before timeout */}
              {Number(s.status) === 0 && isPatient && !timedOut && (
                <button disabled={isThisPending} onClick={() => handleCancel(s.id)}>
                  {isThisPending ? "Cancelling..." : "Cancel (I'm the patient)"}
                </button>
              )}
              {/* Patient claim timeout button — only after timeout */}
              {Number(s.status) === 0 && isPatient && timedOut && (
                <button disabled={isThisPending} onClick={() => handleClaimTimeout(s.id)}>
                  {isThisPending ? "Claiming..." : "⏰ Claim Timeout Refund"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {timeoutDays && (
        <p className="hint">
          Sessions have a {timeoutDays}-day timeout. If the therapist doesn't confirm
          within {timeoutDays} days, the patient can reclaim their escrowed funds.
        </p>
      )}

      {status && <p className="status">{status}</p>}
    </div>
  );
}
