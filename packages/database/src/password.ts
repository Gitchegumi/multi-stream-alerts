import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEYLEN = 64;

/**
 * Hash a plain-text password with scrypt.
 *
 * Output format: `scrypt$<base64-salt>$<base64-hash>`
 *
 * The salt is 16 random bytes; the derived key is 64 bytes.
 * scrypt parameters are fixed at N=16384, r=8, p=1.
 */
export function hashPassword(plain: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/**
 * Verify a plain-text password against a stored scrypt hash.
 *
 * Expects the stored string to match the format produced by `hashPassword`.
 * Returns false for malformed stored hashes instead of throwing.
 */
export function verifyPassword(plain: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, saltB64, hashB64] = parts;
  if (!saltB64 || !hashB64) return false;

  let salt: Buffer;
  let expectedHash: Buffer;
  try {
    salt = Buffer.from(saltB64, 'base64');
    expectedHash = Buffer.from(hashB64, 'base64');
  } catch {
    return false;
  }

  if (salt.length === 0 || expectedHash.length === 0) return false;

  const actualHash = scryptSync(plain, salt, expectedHash.length, SCRYPT_PARAMS);

  try {
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    // timingSafeEqual throws when buffers differ in length
    return false;
  }
}
