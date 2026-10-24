import { useState, useEffect, useCallback } from "react";
import { Identity } from "@semaphore-protocol/identity";

const STORAGE_PREFIX = "mindchain_zk_identity_";

function loadIdentity(address) {
  if (!address) return null;
  const key = `${STORAGE_PREFIX}${address.toLowerCase()}`;
  const saved = localStorage.getItem(key);
  if (!saved) return null;
  try {
    return Identity.import(saved);
  } catch (err) {
    console.error("Failed to restore ZK identity:", err);
    return null;
  }
}

/**
 * useAnonymousIdentity(address)
 *
 * Manages the user's client-side zero-knowledge Semaphore identity.
 * Identities are stored securely in localStorage, scoped to the connected
 * wallet address so switching accounts restores the appropriate identity.
 */
export function useAnonymousIdentity(address) {
  const [identity, setIdentity] = useState(() => loadIdentity(address));

  useEffect(() => {
    setIdentity(loadIdentity(address));
  }, [address]);

  const commitment = identity ? identity.commitment.toString() : null;

  // Generate a brand new Semaphore identity and persist it in localStorage
  const createIdentity = useCallback(() => {
    if (!address) return null;
    try {
      const newId = new Identity();
      const key = `${STORAGE_PREFIX}${address.toLowerCase()}`;
      localStorage.setItem(key, newId.export());
      setIdentity(newId);
      return newId;
    } catch (err) {
      console.error("Failed to create ZK identity:", err);
      throw err;
    }
  }, [address]);

  // Remove identity from localStorage
  const resetIdentity = useCallback(() => {
    if (!address) return;
    const key = `${STORAGE_PREFIX}${address.toLowerCase()}`;
    localStorage.removeItem(key);
    setIdentity(null);
  }, [address]);

  return {
    identity,
    commitment,
    hasIdentity: Boolean(identity),
    createIdentity,
    resetIdentity,
  };
}
