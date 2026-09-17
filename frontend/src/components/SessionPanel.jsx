import { useState, useEffect } from "react";
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

  useEffect(() => {
    if (!contract) return;
    refreshSessions();

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
  }, [contract, address]);

  // SessionEscrow doesn't keep a list of "my sessions" - just a counter and
  // a mapping by ID. So the frontend loops through every session ID and
  // filters for ones involving the connected wallet. Fine for a demo with a
  // handful of sessions; a production app would use events + a backend index.
  async function refreshSessions() {
    const nextId = await contract.nextSessionId();
    const all = [];
    for (let i = 0; i < Number(nextId); i++) {
      const s = await contract.sessions(i);
      // NOTE: ethers v6 returns struct data as a "Result" - an array-like
      // object with both numeric AND named keys. Spreading it directly
      // (`{ ...s }`) is unreliable and caused a runtime crash during
      // testing. Reading each field explicitly by tuple index (matching
      // the struct's declaration order in SessionEscrow.sol: patient,
      // therapist, amount, status, createdAt) is the safe, explicit way.
      const session = {
        id: i,
        patient: s[0],
        therapist: s[1],
        amount: s[2],
        status: s[3],
        createdAt: s[4],
      };
      if (
        session.patient.toLowerCase() === address?.toLowerCase() ||
        session.therapist.toLowerCase() === address?.toLowerCase()
      ) {
        all.push(session);
      }
    }
    setSessions(all);
  }

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
          return (
            <li key={s.id}>
              #{s.id} — {formatEther(s.amount)} ETH — {STATUS_LABELS[Number(s.status)]}
              {" "}
              {Number(s.status) === 0 && s.therapist.toLowerCase() === address?.toLowerCase() && (
                <button disabled={isThisPending} onClick={() => handleConfirm(s.id)}>
                  {isThisPending ? "Confirming..." : "Confirm (I'm the therapist)"}
                </button>
              )}
              {Number(s.status) === 0 && s.patient.toLowerCase() === address?.toLowerCase() && (
                <button disabled={isThisPending} onClick={() => handleCancel(s.id)}>
                  {isThisPending ? "Cancelling..." : "Cancel (I'm the patient)"}
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
