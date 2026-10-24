export function LandingHero({ onConnect, error }) {
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

      <div className="hero-cta">
        <button type="button" className="hero-connect-btn" onClick={onConnect}>
          Connect MetaMask Wallet 🦊
        </button>
        <span className="hero-subtext">
          No sign-ups or institutional accounts required. Your wallet is your identity.
        </span>
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
