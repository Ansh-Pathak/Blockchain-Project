import { useState, useEffect } from "react";
import { parseEther, formatEther } from "ethers";
import { useContract } from "../contracts/useContract";

export function SessionPanel({ signer, address }) {
  const contract = useContract("SessionEscrow", signer);
  const [therapistAddress, setTherapistAddress] = useState("");
  const [fee, setFee] = useState("0.01");
  const [sessions, setSessions] = useState([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!contract) return;
    refreshSessions();
  }, [contract]);

  // SessionEscrow doesn't keep a list of "my sessions" - just a counter and
  // a mapping by ID. So the frontend loops through every session ID and
  // filters for ones involving the connected wallet. Fine for a demo with a
  // handful of sessions; a production app would use events + a backend index.
  async function refreshSessions() {
  const nextId = await contract.nextSessionId();
  const all = [];

  for (let i = 0; i < Number(nextId); i++) {
    const s = await contract.sessions(i);

    if (
      s.patient.toLowerCase() === address?.toLowerCase() ||
      s.therapist.toLowerCase() === address?.toLowerCase()
    ) {
      all.push({
        id: i,
        patient: s.patient,
        therapist: s.therapist,
        amount: s.amount,
        status: s.status,
        timestamp: s.timestamp,
      });
    }
  }

  setSessions(all);
}

  async function handleBook() {
    setStatus("Booking session... confirm in MetaMask");
    try {
      const tx = await contract.bookSession(therapistAddress, { value: parseEther(fee) });
      await tx.wait();
      setStatus("Session booked!");
      await refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleConfirm(id) {
    setStatus(`Confirming session ${id}...`);
    try {
      const tx = await contract.confirmSession(id);
      await tx.wait();
      setStatus(`Session ${id} confirmed - payment + reward sent`);
      await refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  async function handleCancel(id) {
    setStatus(`Cancelling session ${id}...`);
    try {
      const tx = await contract.cancelSession(id);
      await tx.wait();
      setStatus(`Session ${id} cancelled - refunded`);
      await refreshSessions();
    } catch (err) {
      setStatus("Error: " + (err.reason || err.message));
    }
  }

  const STATUS_LABELS = ["Requested", "Completed", "Cancelled"];

  return (
    <div className="panel">
      <h2>Sessions</h2>
      <div>
        <input
          placeholder="Therapist wallet address (0x...)"
          value={therapistAddress}
          onChange={(e) => setTherapistAddress(e.target.value)}
        />
        <input
          type="number"
          step="0.001"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
        />
        <button onClick={handleBook}>Book Session (pay fee in ETH)</button>
      </div>

      <h3>My Sessions</h3>
      {sessions.length === 0 && <p>No sessions yet.</p>}
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            #{s.id} — {formatEther(s.amount)} ETH — {STATUS_LABELS[Number(s.status)]}
            {" "}
            {Number(s.status) === 0 && s.therapist.toLowerCase() === address?.toLowerCase() && (
              <button onClick={() => handleConfirm(s.id)}>Confirm (I'm the therapist)</button>
            )}
            {Number(s.status) === 0 && s.patient.toLowerCase() === address?.toLowerCase() && (
              <button onClick={() => handleCancel(s.id)}>Cancel (I'm the patient)</button>
            )}
          </li>
        ))}
      </ul>

      {status && <p className="status">{status}</p>}
    </div>
  );
}
