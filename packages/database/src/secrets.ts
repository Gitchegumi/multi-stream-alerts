import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCM,
  type DecipherGCM,
} from 'node:crypto';
import { getInstanceEncryptionKey } from '@multi-stream-alerts/shared';

/**
 * AES-256-GCM helpers for encrypting per-channel platform secrets at rest.
 *
 * The ciphertext is a self-describing dot-separated triple of base64
 * strings: `iv.authTag.body`. The 12-byte IV is freshly generated on
 * every call (never reused — GCM's whole security guarantee) and the
 * 16-byte auth tag is what gives us tamper detection: any bit flip in
 * the IV, tag, or body causes `decryptSecret` to throw.
 *
 * Empty string round-trips as `""` so callers can use the empty
 * string as a "not configured" sentinel without paying for a decrypt
 * (or needing a key) at read time.
 *
 * The decoded key is cached on first use. Rotating
 * `INSTANCE_ENCRYPTION_KEY` mid-process is intentionally out of scope
 * for a single-process instance — operators must restart to rotate.
 */

const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

let cachedKey: Buffer | null = null;

/**
 * Lazily resolve and cache the AES-256 key. Calls `getInstanceEncryptionKey`
 * on first use, then reuses the decoded Buffer for the lifetime of the
 * process. Throws (with a clear message) if the env var is missing or
 * the wrong length — see `getInstanceEncryptionKey` in @multi-stream-alerts/shared.
 */
function resolveKey(): Buffer {
  if (cachedKey === null) {
    cachedKey = getInstanceEncryptionKey();
  }
  return cachedKey;
}

/**
 * Test-only seam: clears the cached key so the next call re-reads
 * `process.env.INSTANCE_ENCRYPTION_KEY`. NOT exported from the
 * package barrel — only used by the secrets test suite, which has
 * to verify "missing key" / "wrong length" paths in a single process
 * where `before()` already set a valid key. In production code,
 * mid-process key rotation is out of scope (see module docstring).
 */
export function __resetCachedKeyForTesting(): void {
  cachedKey = null;
}

/**
 * Logs `redact`-sanitized errors to stderr in non-production for
 * debugging. Never logs the underlying value, ciphertext, or key —
 * just the error message, with anything that looks sensitive
 * stripped by `redact`.
 */
function debugLog(err: unknown): void {
  if (process.env.NODE_ENV === 'production') {
    return;
  }
  const message = err instanceof Error ? err.message : String(err);
  // Belt and suspenders: the error messages we construct never carry
  // the value itself, but run the message through `redact` anyway so
  // a future code change that accidentally does so is still safe.
  console.error(`[secrets] ${redact(message)}`);
}

/**
 * Encrypts a plaintext string with AES-256-GCM and returns a
 * self-describing ciphertext of the form `base64(iv).base64(tag).base64(body)`.
 *
 * - `encryptSecret("")` returns `""` (sentinel for "not configured").
 * - Throws a clear error if `INSTANCE_ENCRYPTION_KEY` is missing or
 *   the wrong length (defers to `getInstanceEncryptionKey`).
 * - Two calls with the same plaintext produce two different ciphertexts
 *   because the IV is freshly randomized every time.
 */
export function encryptSecret(plaintext: string): string {
  if (plaintext === '') {
    return '';
  }

  const key = resolveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, {
    authTagLength: AUTH_TAG_BYTES,
  }) as CipherGCM;

  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}.${authTag.toString('base64')}.${body.toString('base64')}`;
}

/**
 * Decrypts a ciphertext produced by `encryptSecret` back to its
 * original plaintext. Returns `""` for the empty-string sentinel.
 *
 * Throws an `Error` whose message starts with `"Failed to decrypt secret"`
 * for every failure mode — tampered IV/tag/body, non-base64 chars,
 * wrong number of dot-segments, or wrong-length segments. Raw
 * exceptions from Node's `crypto` module never leak to the caller
 * (they're caught and re-wrapped with a stable prefix so callers
 * can match on it).
 */
export function decryptSecret(ciphertext: string): string {
  if (ciphertext === '') {
    return '';
  }

  try {
    const parts = ciphertext.split('.');
    if (parts.length !== 3) {
      throw new Error('malformed ciphertext: expected 3 dot-separated segments');
    }

    const [ivPart, tagPart, bodyPart] = parts;
    if (!ivPart || !tagPart || !bodyPart) {
      throw new Error('malformed ciphertext: empty segment');
    }

    // Round-trip each segment through base64 to surface non-base64
    // characters as a clean "Failed to decrypt secret" error rather
    // than letting the decipher throw a low-level Error from crypto.
    const iv = Buffer.from(ivPart, 'base64');
    const authTag = Buffer.from(tagPart, 'base64');
    const body = Buffer.from(bodyPart, 'base64');

    if (iv.length !== IV_BYTES) {
      throw new Error(`malformed ciphertext: IV must be ${IV_BYTES} bytes (got ${iv.length})`);
    }
    if (authTag.length !== AUTH_TAG_BYTES) {
      throw new Error(
        `malformed ciphertext: auth tag must be ${AUTH_TAG_BYTES} bytes (got ${authTag.length})`,
      );
    }

    const key = resolveKey();
    const decipher = createDecipheriv('aes-256-gcm', key, iv, {
      authTagLength: AUTH_TAG_BYTES,
    }) as DecipherGCM;
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(body), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (err) {
    // Re-wrap so callers see a single, stable error message regardless
    // of whether the failure was structural (bad base64, wrong segment
    // count) or cryptographic (GCM auth tag mismatch). The underlying
    // error is logged — redacted — for debugging, but never surfaced.
    debugLog(err);
    throw new Error(
      `Failed to decrypt secret: ${err instanceof Error ? err.message : 'unknown error'}`,
      err instanceof Error ? { cause: err } : undefined,
    );
  }
}

/**
 * Returns a constant `"[REDACTED]"` string. Used by any error or log
 * path that might otherwise echo a secret. The function takes a value
 * argument (and ignores it) so call sites read naturally:
 *
 *     throw new Error(`bad ciphertext: ${redact(value)}`);
 */
export function redact(_value: string): string {
  return '[REDACTED]';
}
