import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, JsonRpcProvider, isAddress, getAddress } from "ethers";
import { EXPECTED_CHAIN_ID } from "../contracts/addresses";

/**
 * Hardhat Localhost default demo accounts seeded with roles in demo-seed.js.
 * Users can 1-click connect as any of these or paste any custom address.
 */
export const PRESET_ACCOUNTS = [
  {
    role: "Patient",
    label: "👤 Patient (Demo)",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    description: "Registered patient with 2 logged journal entries and active session history",
  },
  {
    role: "Therapist",
    label: "🩺 Dr. Demo (Therapist)",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    description: "Approved therapist with earned MIND reward tokens and pending sessions",
  },
  {
    role: "Admin",
    label: "👑 Admin / Deployer",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    description: "Contract deployer with therapist verification authority and admin rights",
  },
];

/**
 * useWallet - Custom hook handling wallet connection.
 * Supports both standard MetaMask (BrowserProvider) and direct address connection
 * (JsonRpcProvider) so users can test, demo, and take screenshots by simply
 * copy-pasting any wallet address.
 */
export function useWallet() {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [error, setError] = useState(null);
  const [connectionMode, setConnectionMode] = useState(null); // "metamask" | "direct" | null

  // 1. Direct connect by copy-pasting any wallet address (uses local JSON-RPC)
  const connectWithAddress = useCallback(async (customAddress) => {
    setError(null);
    if (!customAddress || !isAddress(customAddress.trim())) {
      setError("Invalid Ethereum address. Please enter or paste a valid 42-character address starting with 0x.");
      return false;
    }

    const cleanAddress = getAddress(customAddress.trim());

    try {
      const isSepolia = EXPECTED_CHAIN_ID === 11155111;
      const rpcUrl = isSepolia
        ? "https://ethereum-sepolia-rpc.publicnode.com"
        : "http://127.0.0.1:8545";

      const jsonRpcProvider = new JsonRpcProvider(rpcUrl);
      const network = await jsonRpcProvider.getNetwork();
      setChainId(Number(network.chainId));

      if (!isSepolia) {
        // Attempt to impersonate the account in Hardhat node for local testing
        try {
          await jsonRpcProvider.send("hardhat_impersonateAccount", [cleanAddress]);
        } catch {
          // Ignored if account is already unlocked by default
        }
      }

      setProvider(jsonRpcProvider);
      setAddress(cleanAddress);
      setConnectionMode("direct");
      sessionStorage.setItem("mindchain_direct_address", cleanAddress);
      return true;
    } catch (err) {
      console.error("Direct connection error:", err);
      const msg = EXPECTED_CHAIN_ID === 11155111
        ? `Could not connect to Sepolia RPC (${err.message}). Please connect using MetaMask.`
        : `Could not connect to local blockchain at http://127.0.0.1:8545 (${err.message}). Please ensure 'npx hardhat node' is running in your terminal.`;
      setError(msg);
      return false;
    }
  }, []);

  // 2. Standard MetaMask browser connection
  const connect = useCallback(async () => {
    setError(null);

    if (!window.ethereum) {
      setError("MetaMask not found. You can still connect instantly by pasting any address below!");
      return;
    }

    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const network = await browserProvider.getNetwork();

      sessionStorage.removeItem("mindchain_direct_address");
      setProvider(browserProvider);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
      setConnectionMode("metamask");
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
    }
  }, []);

  // 3. Disconnect active account
  const disconnect = useCallback(() => {
    setAddress(null);
    setProvider(null);
    setChainId(null);
    setConnectionMode(null);
    sessionStorage.removeItem("mindchain_direct_address");
  }, []);

  // Restore saved direct connection if browser was refreshed
  useEffect(() => {
    let cancelled = false;
    const saved = sessionStorage.getItem("mindchain_direct_address");
    if (saved && isAddress(saved) && !address) {
      (async () => {
        try {
          const isSepolia = EXPECTED_CHAIN_ID === 11155111;
          const rpcUrl = isSepolia
            ? "https://ethereum-sepolia-rpc.publicnode.com"
            : "http://127.0.0.1:8545";
          const jsonRpcProvider = new JsonRpcProvider(rpcUrl);
          const net = await jsonRpcProvider.getNetwork();
          if (cancelled) return;
          if (!isSepolia) {
            try {
              await jsonRpcProvider.send("hardhat_impersonateAccount", [saved]);
            } catch {
              // Ignored if unsupported
            }
          }
          if (cancelled) return;
          setChainId(Number(net.chainId));
          setProvider(jsonRpcProvider);
          setAddress(saved);
          setConnectionMode("direct");
        } catch {
          // Node may not be running yet upon initial load
        }
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [address]);

  // MetaMask event listeners (only active if connected via MetaMask)
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = (accounts) => {
      if (connectionMode === "metamask") {
        setAddress(accounts.length > 0 ? accounts[0] : null);
      }
    };
    const handleChainChanged = (newChainIdHex) => {
      if (connectionMode === "metamask") {
        setChainId(parseInt(newChainIdHex, 16));
      }
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [connectionMode]);

  const isWrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  const switchToExpectedNetwork = useCallback(async () => {
    if (!window.ethereum) return;
    const chainIdHex = "0x" + EXPECTED_CHAIN_ID.toString(16);

    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        if (EXPECTED_CHAIN_ID === 11155111) {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: "0xaa36a7",
              chainName: "Sepolia Test Network",
              rpcUrls: ["https://rpc.sepolia.org", "https://ethereum-sepolia-rpc.publicnode.com"],
              nativeCurrency: { name: "SepoliaETH", symbol: "ETH", decimals: 18 },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            }],
          });
        } else {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [{
              chainId: chainIdHex,
              chainName: "Hardhat Local",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            }],
          });
        }
      } else {
        setError(switchError.message || "Failed to switch network");
      }
    }
  }, []);

  return {
    address,
    chainId,
    provider,
    error,
    connect,
    connectWithAddress,
    disconnect,
    connectionMode,
    isWrongNetwork,
    switchToExpectedNetwork,
  };
}
