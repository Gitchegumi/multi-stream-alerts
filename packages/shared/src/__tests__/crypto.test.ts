import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encrypt, decrypt } from '../crypto';

// Set up a valid ENCRYPTION_KEY for tests
process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');

test('encrypt and decrypt round-trip a plaintext string', () => {
  const plaintext = 'my-secret-oauth-token-12345';
  const ciphertext = encrypt(plaintext);
  assert.notEqual(ciphertext, plaintext, 'ciphertext must not equal plaintext');
  const decrypted = decrypt(ciphertext);
  assert.equal(decrypted, plaintext);
});

test('encrypt produces different ciphertexts for the same plaintext (random IV)', () => {
  const plaintext = 'same-secret';
  const c1 = encrypt(plaintext);
  const c2 = encrypt(plaintext);
  assert.notEqual(c1, c2, 'different IVs must produce different ciphertexts');
  assert.equal(decrypt(c1), plaintext);
  assert.equal(decrypt(c2), plaintext);
});

test('decrypt throws on tampered ciphertext', () => {
  const ciphertext = encrypt('secret');
  // Flip a byte at the end of the ciphertext
  const buf = Buffer.from(ciphertext, 'base64');
  const lastIdx = buf.length - 1;
  if (lastIdx < 0) throw new Error('ciphertext too short to tamper');
  buf.writeUInt8(buf.readUInt8(lastIdx) ^ 0x01, lastIdx);
  const tampered = buf.toString('base64');
  assert.throws(
    () => decrypt(tampered),
    (err: unknown) => err instanceof Error,
  );
});

test('decrypt throws on too-short ciphertext', () => {
  assert.throws(
    () => decrypt('aGVsbG8='), // 5 bytes — too short
    /too short/,
  );
});

test('encrypt throws when ENCRYPTION_KEY is missing (fresh process)', async () => {
  // Re-import the module in isolation so the cached key is empty.
  // We use a dynamic import with a cache-busting query string.
  const saved = process.env.ENCRYPTION_KEY;
  delete process.env.ENCRYPTION_KEY;
  try {
    const mod = await import(`../crypto?t=${Date.now()}`);
    assert.throws(() => mod.encrypt('test'), /ENCRYPTION_KEY/);
  } finally {
    process.env.ENCRYPTION_KEY = saved;
  }
});

test('encrypt throws when ENCRYPTION_KEY is too short (fresh process)', async () => {
  const saved = process.env.ENCRYPTION_KEY;
  process.env.ENCRYPTION_KEY = 'short';
  try {
    const mod = await import(`../crypto?t=${Date.now()}`);
    assert.throws(() => mod.encrypt('test'), /ENCRYPTION_KEY/);
  } finally {
    process.env.ENCRYPTION_KEY = saved;
  }
});
