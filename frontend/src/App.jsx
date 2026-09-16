import { useEffect, useState } from "react";
import { useWallet } from "./hooks/useWallet";
import { PatientPanel } from "./components/PatientPanel";
import { TherapistPanel } from "./components/TherapistPanel";
import { TokenBalancePanel } from "./components/TokenBalancePanel";
import { SessionPanel } from "./components/SessionPanel";
import { GovernancePanel } from "./components/GovernancePanel";
import "./App.css";

function App() {
  const { address, provider, error, connect, isWrongNetwork } = useWallet();

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
          Wrong network - please switch MetaMask to the local Hardhat network (chain ID 1337).
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

  useEffect(() => {
    provider.getSigner().then(setSigner);
  }, [provider]);

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
