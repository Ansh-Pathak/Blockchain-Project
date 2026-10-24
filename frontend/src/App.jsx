import { useEffect, useState } from "react";
import { useWallet } from "./hooks/useWallet";
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

function AppContent() {
  const { address, provider, error, connect, isWrongNetwork, switchToExpectedNetwork } = useWallet();

  return (
    <div className="app">
      <header>
        <div className="header-brand">
          <h1>MindChain DAO</h1>
          <span className="network-badge">Ethereum • SDG 3</span>
        </div>
        {address ? (
          <div className="wallet-info">
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <button type="button" onClick={connect}>Connect Wallet</button>
        )}
      </header>

      {error && !address && null /* Handled in LandingHero */}

      {isWrongNetwork && (
        <div className="error network-error">
          <span>Wrong network — MetaMask must be connected to the local Hardhat network (Chain ID: 1337) or Sepolia.</span>
          <button type="button" onClick={switchToExpectedNetwork}>Switch Network</button>
        </div>
      )}

      {/* Disconnected state: show interactive Landing Hero */}
      {!address && (
        <LandingHero onConnect={connect} error={error} />
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
    provider.getSigner().then((s) => {
      if (!cancelled) setSigner(s);
    });
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
