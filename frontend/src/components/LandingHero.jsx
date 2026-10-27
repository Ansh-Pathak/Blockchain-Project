import { useState } from "react";
import { PRESET_ACCOUNTS } from "../hooks/useWallet";

export function LandingHero({ onConnect, onConnectWithAddress, error }) {
  const [pastedAddress, setPastedAddress] = useState("");

  const handleDirectConnect = () => {
    if (pastedAddress.trim()) {
      onConnectWithAddress(pastedAddress.trim());
    }
  };

  return (
    <div className="landing-hero">
      <div className="hero-badge">
        <span className="sdg-tag">UN SDG 3</span>
        <span>Good Health and Well-Being</span>
      </div>

      <h1 className="hero-title">
        Privacy-Preserving Mental Health Support on Ethereum
      </h1>

      <p className="hero-lead">
        MindChain DAO provides confidential mental health support, zero-knowledge anonymous journaling,
        escrow-backed therapy sessions, and decentralized community governance.
      </p>

      {/* Connection Container: MetaMask + Direct Address Paste */}
      <div className="hero-connect-card">
        <div className="hero-cta">
          <button type="button" className="hero-connect-btn" onClick={onConnect}>
            Connect MetaMask Wallet 🦊
          </button>
          <span className="hero-subtext">
            Standard Web3 browser connection via MetaMask.
          </span>
        </div>

        <div className="hero-divider">
          <span>OR CONNECT INSTANTLY BY ADDRESS</span>
        </div>

        <div className="address-connect-box">
          <p className="address-connect-desc">
            No MetaMask extension required! Paste any wallet address below or click a pre-seeded demo role to jump in:
          </p>

          <div className="address-input-row">
            <input
              type="text"
              className="address-input"
              placeholder="Paste wallet address (0x...)"
              value={pastedAddress}
              onChange={(e) => setPastedAddress(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDirectConnect()}
            />
            <button
              type="button"
              className="btn-address-connect"
              onClick={handleDirectConnect}
            >
              Connect Address
            </button>
          </div>

          <div className="hero-presets">
            <span className="preset-label">1-Click Demo Accounts:</span>
            <div className="preset-buttons">
              {PRESET_ACCOUNTS.map((acc) => (
                <button
                  key={acc.role}
                  type="button"
                  className="preset-btn"
                  onClick={() => onConnectWithAddress(acc.address)}
                  title={acc.description}
                >
                  <span className="preset-role">{acc.label}</span>
                  <span className="preset-addr">{acc.address.slice(0, 6)}...{acc.address.slice(-4)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="error hero-error">{error}</div>}

      <div className="hero-feature-grid">
        <div className="hero-feature-card">
          <div className="feature-icon">🔒</div>
          <h3>Zero-Knowledge Privacy</h3>
          <p>
            Log encrypted journal entries to IPFS using Semaphore ZK-SNARKs. Prove you are a registered patient
            without ever exposing your address on-chain.
          </p>
        </div>

        <div className="hero-feature-card">
          <div className="feature-icon">🛡️</div>
          <h3>Escrow Protected Sessions</h3>
          <p>
            Book sessions with verified therapists. Funds are held safely in escrow until confirmation,
            protected by reentrancy guards and a 7-day safety timeout.
          </p>
        </div>

        <div className="hero-feature-card">
          <div className="feature-icon">🪙</div>
          <h3>MIND Reward Token</h3>
          <p>
            Therapists earn ERC-20 MIND tokens for verified sessions. Tokens confer voting weight in platform
            governance proposals.
          </p>
        </div>

        <div className="hero-feature-card">
          <div className="feature-icon">🏛️</div>
          <h3>Executable Governance</h3>
          <p>
            A true DAO with executable proposals. Token holders vote to approve therapists or adjust
            parameters directly on smart contracts.
          </p>
        </div>
      </div>
    </div>
  );
}
