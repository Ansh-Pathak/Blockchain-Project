import { useState, useEffect, useRef } from "react";

/**
 * SessionChatRoom
 *
 * A private, end-to-end scoped consultation chat room between
 * the specific patient and verified therapist who booked the session.
 *
 * Access Control:
 * - Only the assigned patient and therapist can enter and read/write messages.
 * - When the session status is Requested (0), the chat room is ACTIVE.
 * - When the session is Completed (1) or Cancelled (2), the chat room
 *   automatically CLOSES, locking message input and archiving the consultation.
 *
 * Real-Time Sync:
 * - Synchronizes across browser tabs/windows using BroadcastChannel and localStorage.
 */
export function SessionChatRoom({ session, currentUserAddress, onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef(null);

  const isPatient = currentUserAddress && session.patient
    ? currentUserAddress.toLowerCase() === session.patient.toLowerCase()
    : false;

  const isTherapist = currentUserAddress && session.therapist
    ? currentUserAddress.toLowerCase() === session.therapist.toLowerCase()
    : false;

  const isAuthorized = isPatient || isTherapist;

  const isCompleted = Number(session.status) === 1;
  const isCancelled = Number(session.status) === 2;
  const isClosed = isCompleted || isCancelled;

  const storageKey = `mindchain_chat_session_${session.id}`;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Load messages and setup real-time BroadcastChannel sync
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse chat messages:", err);
      }
    } else {
      // Initial system introduction
      const initialSystemMsg = {
        id: `sys_${session.id}_init`,
        sender: "SYSTEM",
        role: "System",
        text: `🔒 Confidential consultation room opened for Session #${session.id}. Messages are visible solely to the booking patient and assigned therapist.`,
        timestamp: session.createdAt ? Number(session.createdAt) * 1000 : Date.now(),
      };
      setMessages([initialSystemMsg]);
      localStorage.setItem(storageKey, JSON.stringify([initialSystemMsg]));
    }

    // BroadcastChannel for instant cross-tab real-time sync
    let channel;
    try {
      channel = new BroadcastChannel("mindchain_session_chat_channel");
      channel.onmessage = (event) => {
        if (event.data?.sessionId === session.id && event.data?.message) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === event.data.message.id)) return prev;
            const next = [...prev, event.data.message];
            localStorage.setItem(storageKey, JSON.stringify(next));
            return next;
          });
        }
      };
    } catch {
      // BroadcastChannel unsupported or restricted in this environment
    }

    // Storage event listener fallback for cross-tab sync
    const handleStorage = (e) => {
      if (e.key === storageKey && e.newValue) {
        try {
          setMessages(JSON.parse(e.newValue));
        } catch {}
      }
    };
    window.addEventListener("storage", handleStorage);

    return () => {
      if (channel) channel.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [session.id, storageKey, session.createdAt]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = (textToSend = inputText) => {
    const clean = textToSend.trim();
    if (!clean || isClosed || !isAuthorized) return;

    const newMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sessionId: session.id,
      sender: currentUserAddress,
      role: isTherapist ? "Therapist" : "Patient",
      text: clean,
      timestamp: Date.now(),
    };

    setMessages((prev) => {
      const updated = [...prev, newMessage];
      localStorage.setItem(storageKey, JSON.stringify(updated));
      return updated;
    });

    try {
      const channel = new BroadcastChannel("mindchain_session_chat_channel");
      channel.postMessage({ sessionId: session.id, message: newMessage });
      channel.close();
    } catch {}

    setInputText("");
  };

  if (!isAuthorized) {
    return (
      <div className="chat-room-container unauthorized">
        <div className="chat-unauth-box">
          <h3>🔒 Private Consultation Room</h3>
          <p>
            You are not a participant in Session #{session.id}. Only the booking patient
            (<code>{session.patient.slice(0, 6)}...{session.patient.slice(-4)}</code>) and assigned therapist
            (<code>{session.therapist.slice(0, 6)}...{session.therapist.slice(-4)}</code>) have access.
          </p>
          <button type="button" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-room-card">
      <div className="chat-header">
        <div className="chat-title-group">
          <div className="chat-title-row">
            <h4>💬 Session #{session.id} Consultation Room</h4>
            {isClosed ? (
              <span className={`chat-status-badge ${isCompleted ? "completed" : "cancelled"}`}>
                🔒 {isCompleted ? "Session Completed — Chatroom Closed" : "Session Cancelled — Chatroom Closed"}
              </span>
            ) : (
              <span className="chat-status-badge active">
                🟢 Live Consultation Room
              </span>
            )}
          </div>
          <div className="chat-participants">
            <span>👤 Patient: <code>{session.patient.slice(0, 6)}...{session.patient.slice(-4)}</code> {isPatient && "(You)"}</span>
            <span>•</span>
            <span>🩺 Therapist: <code>{session.therapist.slice(0, 6)}...{session.therapist.slice(-4)}</code> {isTherapist && "(You)"}</span>
          </div>
        </div>
        <button type="button" className="btn-close-chat" onClick={onClose} title="Minimize or close chat window">
          ✕ Minimize
        </button>
      </div>

      {isClosed && (
        <div className={`chat-closed-banner ${isCompleted ? "banner-completed" : "banner-cancelled"}`}>
          <div className="banner-icon">🔒</div>
          <div className="banner-content">
            <strong>Consultation Concluded On-Chain</strong>
            <p>
              {isCompleted
                ? "This therapy session has been confirmed and finalized on Ethereum. The chatroom is officially closed."
                : "This therapy session was cancelled and refunded. The chatroom is closed."}
            </p>
          </div>
        </div>
      )}

      {/* Message List */}
      <div className="chat-messages-container">
        {messages.map((m) => {
          if (m.sender === "SYSTEM") {
            return (
              <div key={m.id} className="chat-system-msg">
                <span>{m.text}</span>
              </div>
            );
          }

          const isMine = currentUserAddress && m.sender.toLowerCase() === currentUserAddress.toLowerCase();
          const roleLabel = m.role === "Therapist" ? "🩺 Therapist" : "👤 Patient";

          return (
            <div key={m.id} className={`chat-bubble-row ${isMine ? "outgoing" : "incoming"}`}>
              <div className="chat-bubble">
                <div className="bubble-meta">
                  <span className="bubble-author">{isMine ? "You" : roleLabel}</span>
                  <span className="bubble-time">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <div className="bubble-text">{m.text}</div>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input or Closed Notice */}
      {!isClosed ? (
        <div className="chat-input-area">
          {/* Quick Demo Starters */}
          <div className="chat-quick-starters">
            <span className="starters-label">Quick Prompts:</span>
            {isPatient ? (
              <>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => handleSendMessage("Hello Doctor, thank you for accepting my session.")}
                >
                  "Hello Doctor, ready to start"
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => handleSendMessage("I've been experiencing anxiety this week and wanted your advice.")}
                >
                  "Experiencing anxiety this week"
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => handleSendMessage("Hello! Welcome to our session. How can I support you today?")}
                >
                  "Welcome, how can I support you?"
                </button>
                <button
                  type="button"
                  className="starter-btn"
                  onClick={() => handleSendMessage("Thank you for sharing. Let's work through some coping strategies.")}
                >
                  "Let's work through strategies"
                </button>
              </>
            )}
          </div>

          <form
            className="chat-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              type="text"
              placeholder={`Type a private message as ${isTherapist ? "Therapist" : "Patient"}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
            />
            <button type="submit" disabled={!inputText.trim()}>
              Send Message
            </button>
          </form>
          <div className="chat-disclaimer">
            🔒 Private consultation. Messages are stored strictly in local session storage and shared in real-time.
          </div>
        </div>
      ) : (
        <div className="chat-input-area closed">
          <input
            type="text"
            disabled
            value="🔒 This consultation is closed. Session has concluded on-chain."
            readOnly
          />
          <button type="button" disabled>
            Closed
          </button>
        </div>
      )}
    </div>
  );
}
