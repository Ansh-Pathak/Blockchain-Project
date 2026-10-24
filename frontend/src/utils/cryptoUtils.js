/**
 * Client-Side Encryption Utilities for MindChain DAO
 *
 * Uses the Web Crypto API (SubtleCrypto) for authenticated AES-GCM 256-bit encryption.
 * Encryption runs 100% inside the user's browser before data ever touches IPFS.
 */

// Helper to convert Uint8Array <-> Hex string
export function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derives a 256-bit AES-GCM CryptoKey from a user secret string (e.g. passphrase or ZK identity).
 */
async function deriveKey(secret) {
  const enc = new TextEncoder();
  const secretBytes = enc.encode(secret);
  const hash = await window.crypto.subtle.digest("SHA-256", secretBytes);
  return window.crypto.subtle.importKey(
    "raw",
    hash,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypts a plain text string using AES-GCM 256-bit.
 *
 * @param {string} plainText The sensitive journal text to encrypt.
 * @param {string} secret The patient's secret key or passphrase.
 * @returns {Promise<object>} The encrypted envelope { iv, ciphertext, algorithm: 'AES-GCM-256' }
 */
export async function encryptJournal(plainText, secret) {
  const key = await deriveKey(secret);
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV standard for AES-GCM
  const encoded = new TextEncoder().encode(plainText);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  return {
    algorithm: "AES-GCM-256",
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(new Uint8Array(cipherBuffer)),
    timestamp: Date.now(),
  };
}

/**
 * Decrypts an encrypted envelope using AES-GCM 256-bit.
 *
 * @param {object} envelope { iv, ciphertext }
 * @param {string} secret The patient's secret key or passphrase.
 * @returns {Promise<string>} The decrypted plaintext string.
 */
export async function decryptJournal(envelope, secret) {
  const key = await deriveKey(secret);
  const iv = hexToBytes(envelope.iv);
  const cipherBytes = hexToBytes(envelope.ciphertext);

  const plainBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBytes
  );

  return new TextDecoder().decode(plainBuffer);
}
