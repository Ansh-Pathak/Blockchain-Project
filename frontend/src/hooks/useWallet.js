import { useState, useCallback, useEffect } from "react";
import { BrowserProvider } from "ethers";
import { EXPECTED_CHAIN_ID } from "../contracts/addresses";

/**
 * useWallet - a custom React "hook".
 *
 * A hook is just a regular function whose name starts with "use" that lets
 * you reuse stateful logic across components. Here, it handles everything
 * related to connecting to MetaMask so App.jsx doesn't need to know the
 * details - it just calls `connect()` and reads `address`.
 */
export function useWallet() {
  // useState gives us a piece of memory ("state") that persists between
  // re-renders, plus a function to update it. When you call the setter
  // (e.g. setAddress), React automatically re-renders any component that
  // reads that state, which is how the UI updates itself.
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [provider, setProvider] = useState(null);
  const [error, setError] = useState(null);

  const connect = useCallback(async () => {
    setError(null);

    if (!window.ethereum) {
      setError("MetaMask not found. Please install the MetaMask browser extension.");
      return;
    }

    try {
      // BrowserProvider wraps MetaMask so ethers.js can talk to it.
      const browserProvider = new BrowserProvider(window.ethereum);

      // This triggers the MetaMask popup asking the user to approve connecting.
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setAddress(accounts[0]);
      setChainId(Number(network.chainId));
    } catch (err) {
      setError(err.message || "Failed to connect wallet");
    }
  }, []);

  // useEffect runs side effects - code that reaches outside of React, like
  // subscribing to browser/MetaMask events. The empty array [] at the end
  // means "only run this once, when the component first mounts."
  useEffect(() => {
    if (!window.ethereum) return;

    // If the user switches accounts or networks in MetaMask itself, these
    // event listeners keep our React state in sync automatically.
    const handleAccountsChanged = (accounts) => {
      setAddress(accounts.length > 0 ? accounts[0] : null);
    };
    const handleChainChanged = (newChainIdHex) => {
      setChainId(parseInt(newChainIdHex, 16));
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  const isWrongNetwork = chainId !== null && chainId !== EXPECTED_CHAIN_ID;

  // Lets the user fix a wrong-network situation with one click instead of
  // manually digging through MetaMask's network settings mid-demo.
  // wallet_switchEthereumChain asks MetaMask to switch; if it doesn't know
  // this network yet, MetaMask throws error code 4902, and we fall back to
  // wallet_addEthereumChain to add it, then switch.
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
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: chainIdHex,
            chainName: "Hardhat Local",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          }],
        });
      } else {
        setError(switchError.message || "Failed to switch network");
      }
    }
  }, []);

  return { address, chainId, provider, error, connect, isWrongNetwork, switchToExpectedNetwork };
}
