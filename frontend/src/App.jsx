import { useEffect, useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { PatientPanel } from "./components/PatientPanel";
import { TherapistPanel } from "./components/TherapistPanel";
import { TokenBalancePanel } from "./components/TokenBalancePanel";
import { SessionPanel } from "./components/SessionPanel";
import { GovernancePanel } from "./components/GovernancePanel";
import "./App.css";

function App() {
  const { address, provider, error, connect, isWrongNetwork, switchToExpectedNetwork } = useWallet();

  return (
    <div className="app">
      <header>
        <h1>MindChain DAO</h1>
        {address ? (
          <div className="wallet-info">
            Connected: {address.slice(0, 6)}...{address.slice(-4)}
          </div>
        ) : (
          <button onClick={connect}>Connect Wallet</button>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      {isWrongNetwork && (
        <p className="error">
          Wrong network - MetaMask needs to be on the local Hardhat network (chain ID 1337).{" "}
          <button onClick={switchToExpectedNetwork}>Switch Network</button>
        </p>
      )}

      {/*
        Panels only render once a wallet is connected, since they all need
        an address/signer to work.
      */}
      {address && provider && !isWrongNetwork && (
        <MainContent provider={provider} address={address} />
      )}
    </div>
  );
}

// A signer (needed to send transactions) is only available asynchronously
// from ethers, so this small wrapper component resolves it once and then
// renders all the panels together.
function MainContent({ provider, address }) {
  const [signer, setSigner] = useState(null);

  // IMPORTANT: `address` must be in this dependency array, not just
  // `provider`. The BrowserProvider object itself doesn't change when you
  // switch accounts in MetaMask - only the active address does. Without
  // `address` here, switching from e.g. the patient account to the
  // therapist account would silently keep sending transactions as the OLD
  // account until the page was refreshed. Re-running this effect whenever
  // address changes keeps the signer (and therefore every panel) in sync
  // with whichever account is actually selected in MetaMask.
  useEffect(() => {
    let cancelled = false;
    provider.getSigner().then((s) => {
      if (!cancelled) setSigner(s);
    });
    return () => {
      cancelled = true;
    };
  }, [provider, address]);

  if (!signer) return <p>Loading signer...</p>;

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

export default App;
