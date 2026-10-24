import { useState, useCallback } from "react";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw";

const LOCAL_STORAGE_IPFS_PREFIX = "mindchain_ipfs_";

/**
 * useIPFS()
 *
 * Provides IPFS upload and retrieval functionality for encrypted patient journals.
 * Calculates standards-compliant CIDv1 (raw multihash sha2-256).
 *
 * Supports:
 * - Content-Addressable Storage (CAS) with instant local persistence for demos & offline dev
 * - Pinata pinning if VITE_PINATA_JWT is provided in frontend .env
 * - Gateway fetching from public IPFS gateways with local cache fallback
 */
export function useIPFS() {
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [ipfsError, setIpfsError] = useState(null);

  /**
   * Upload an encrypted JSON payload to IPFS and return its CID.
   *
   * @param {object|string} data The payload to store.
   * @returns {Promise<{ cid: string, ipfsUri: string }>}
   */
  const uploadToIPFS = useCallback(async (data) => {
    setIsUploading(true);
    setIpfsError(null);

    try {
      const jsonString = typeof data === "string" ? data : JSON.stringify(data);
      const bytes = new TextEncoder().encode(jsonString);

      // 1. Calculate cryptographic CIDv1
      const hash = await sha256.digest(bytes);
      const cidObj = CID.create(1, raw.code, hash);
      const cid = cidObj.toString();

      // 2. Persist in local Content-Addressable Storage cache
      localStorage.setItem(`${LOCAL_STORAGE_IPFS_PREFIX}${cid}`, jsonString);

      // 3. If Pinata JWT is configured in .env, attempt pinning
      const pinataJwt = import.meta.env?.VITE_PINATA_JWT;
      if (pinataJwt) {
        try {
          await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${pinataJwt}`,
            },
            body: JSON.stringify({
              pinataContent: data,
              pinataMetadata: { name: `mindchain-${cid.slice(0, 8)}` },
            }),
          });
        } catch (pinErr) {
          console.warn("Pinata upload attempt failed, cached locally in CAS:", pinErr);
        }
      }

      return {
        cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `https://ipfs.io/ipfs/${cid}`,
      };
    } catch (err) {
      console.error("IPFS upload error:", err);
      setIpfsError(err.message);
      throw err;
    } finally {
      setIsUploading(false);
    }
  }, []);

  /**
   * Fetch an encrypted JSON payload from IPFS by its CID.
   *
   * @param {string} cid The IPFS Content Identifier.
   * @returns {Promise<object>} The parsed payload.
   */
  const fetchFromIPFS = useCallback(async (cid) => {
    setIsDownloading(true);
    setIpfsError(null);

    try {
      // 1. Check local Content-Addressable Storage
      const cached = localStorage.getItem(`${LOCAL_STORAGE_IPFS_PREFIX}${cid}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // 2. Fallback to public IPFS gateways
      const gateways = [
        `https://ipfs.io/ipfs/${cid}`,
        `https://gateway.pinata.cloud/ipfs/${cid}`,
        `https://cloudflare-ipfs.com/ipfs/${cid}`,
      ];

      for (const url of gateways) {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const json = await res.json();
            // Cache locally for subsequent views
            localStorage.setItem(`${LOCAL_STORAGE_IPFS_PREFIX}${cid}`, JSON.stringify(json));
            return json;
          }
        } catch {
          // Try next gateway
        }
      }

      throw new Error(`Could not retrieve content for CID: ${cid}`);
    } catch (err) {
      console.error("IPFS fetch error:", err);
      setIpfsError(err.message);
      throw err;
    } finally {
      setIsDownloading(false);
    }
  }, []);

  return {
    uploadToIPFS,
    fetchFromIPFS,
    isUploading,
    isDownloading,
    ipfsError,
  };
}
