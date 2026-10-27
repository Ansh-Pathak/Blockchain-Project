import { useEffect, useState } from "react";
import { useWallet, PRESET_ACCOUNTS } from "./hooks/useWallet";
import { PatientPanel } from "./components/PatientPanel";
import { TherapistPanel } from "./components/TherapistPanel";
import { TokenBalancePanel } from "./components/TokenBalancePanel";
import { SessionPanel } from "./components/SessionPanel";
import { GovernancePanel } from "./components/GovernancePanel";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import { LandingHero } from "./components/LandingHero";
import { Spinner } from "./components/LoadingSkeleton";
import "./App.css";

import { EXPECTED_CHAIN_ID } from "./contracts/addresses";

function AppContent() {
  const {
    address,
    provider,
    error,
    connect,
    connectWithAddress,
    disconnect,
    connectionMode,
    isWrongNetwork,
    switchToExpectedNetwork,
  } = useWallet();

  const [isSwitchOpen, setIsSwitchOpen] = useState(false);
  const [switchAddressInput, setSwitchAddressInput] = useState("");

  const matchedPreset = address
    ? PRESET_ACCOUNTS.find((a) => a.address.toLowerCase() === address.toLowerCase())
    : null;

  const handleSwitchSubmit = () => {
    if (switchAddressInput.trim()) {
      connectWithAddress(switchAddressInput.trim());
      setSwitchAddressInput("");
      setIsSwitchOpen(false);
    }
  };

  return (
    <div className="app">
      <header>
        <div className="header-brand">
          <h1>MindChain DAO</h1>
          <span className="network-badge">Ethereum • SDG 3</span>
        </div>

        {address ? (
          <div className="wallet-header-actions">
            <div className="wallet-info" title={address}>
              <span>Connected: {address.slice(0, 6)}...{address.slice(-4)}</span>
              {matchedPreset && (
                <span className="wallet-role-pill">{matchedPreset.role}</span>
              )}
              {connectionMode === "direct" && (
                <span className="direct-mode-pill" title="Connected via local Hardhat JSON-RPC node">Local RPC</span>
              )}
            </div>

            <button
              type="button"
              className="btn-switch-account"
              onClick={() => setIsSwitchOpen((prev) => !prev)}
            >
              {isSwitchOpen ? "Close Switcher" : "Switch Account"}
            </button>

            <button
              type="button"
              className="btn-disconnect"
              onClick={disconnect}
              title="Disconnect active account"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button type="button" onClick={connect}>Connect MetaMask</button>
        )}
      </header>

      {/* Account Switcher Bar when connected */}
      {address && isSwitchOpen && (
        <div className="account-switcher-bar">
          <div className="switcher-header">
            <strong>Switch Active Perspective</strong>
            <span>Paste any address or pick a demo account to instantly test or screenshot as that role:</span>
          </div>

          <div className="switcher-input-row">
            <input
              type="text"
              placeholder="Paste wallet address (0x...)"
              value={switchAddressInput}
              onChange={(e) => setSwitchAddressInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSwitchSubmit()}
            />
            <button type="button" onClick={handleSwitchSubmit}>
              Switch Address
            </button>
          </div>

          <div className="switcher-presets">
            {PRESET_ACCOUNTS.map((acc) => {
              const isCurrent = acc.address.toLowerCase() === address.toLowerCase();
              return (
                <button
                  key={acc.role}
                  type="button"
                  className={`switcher-preset-chip ${isCurrent ? "active" : ""}`}
                  onClick={() => {
                    connectWithAddress(acc.address);
                    setIsSwitchOpen(false);
                  }}
                  title={acc.description}
                >
                  {acc.label} {isCurrent && "✓ (Active)"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && !address && null /* Handled in LandingHero */}

      {isWrongNetwork && (
        <div className="error network-error">
          <span>
            Wrong network — MetaMask must be connected to{" "}
            {EXPECTED_CHAIN_ID === 11155111
              ? "Ethereum Sepolia Testnet (Chain ID: 11155111)"
              : `the configured network (Chain ID: ${EXPECTED_CHAIN_ID})`}
            .
          </span>
          <button type="button" onClick={switchToExpectedNetwork}>Switch Network</button>
        </div>
      )}

      {/* Disconnected state: show interactive Landing Hero with direct paste connect */}
      {!address && (
        <LandingHero
          onConnect={connect}
          onConnectWithAddress={connectWithAddress}
          error={error}
        />
      )}

      {/* Connected state: render dashboard panels */}
      {address && provider && !isWrongNetwork && (
        <MainContent provider={provider} address={address} />
      )}
    </div>
  );
}

function MainContent({ provider, address }) {
  const [signer, setSigner] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setSigner(null);

    const getSignerInstance = async () => {
      try {
        const s = await provider.getSigner(address);
        if (!cancelled) setSigner(s);
      } catch {
        try {
          const s = await provider.getSigner();
          if (!cancelled) setSigner(s);
        } catch (e) {
          console.error("Failed to acquire signer:", e);
        }
      }
    };

    getSignerInstance();
    return () => {
      cancelled = true;
    };
  }, [provider, address]);

  if (!signer) {
    return (
      <div className="main-loading">
        <Spinner label="Connecting to wallet and loading accounts..." />
      </div>
    );
  }

  return (
    <div className="grid">
      <PatientPanel signer={signer} address={address} />
      <TherapistPanel signer={signer} address={address} />
      <TokenBalancePanel provider={provider} address={address} />
      <SessionPanel signer={signer} address={address} />
      <GovernancePanel signer={signer} address={address} />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AppContent />
      </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;
