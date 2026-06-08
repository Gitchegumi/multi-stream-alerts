/**
 * Encryption utilities for sensitive token storage.
 *
 * Uses AES-256-GCM with a key derived from the ENCRYPTION_KEY env var.
 * Ciphertext format: base64( iv(12 bytes) + authTag(16 bytes) + ciphertext )
 *
 * @module crypto
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Derive a 32-byte key from the ENCRYPTION_KEY env var using scrypt.
 * Memoized for performance — called once per process.
 */
function getKey(): Buffer {
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey || rawKey.length < 16) {
    throw new Error('ENCRYPTION_KEY must be set and at least 16 characters long');
  }
  return scryptSync(rawKey, 'multi-stream-alerts-salt', KEY_LENGTH);
}

let cachedKey: Buffer | null = null;
function key(): Buffer {
  if (!cachedKey) {
    cachedKey = getKey();
  }
  return cachedKey;
}

/**
 * Encrypt a plaintext string.
 *
 * @param plaintext - The string to encrypt
 * @returns Base64-encoded ciphertext (iv + authTag + encrypted data)
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key(), iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

/**
 * Decrypt a ciphertext string produced by {@link encrypt}.
 *
 * @param ciphertext - Base64-encoded ciphertext
 * @returns The original plaintext string
 * @throws Error if decryption fails (tampered or malformed input)
 */
export function decrypt(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, 'base64');

  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
