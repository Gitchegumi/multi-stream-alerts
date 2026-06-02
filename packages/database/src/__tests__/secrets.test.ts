import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret, redact, __resetCachedKeyForTesting } from '../secrets.ts';

// NOTE: This file uses `before()` (not `beforeEach()`) so the env var
// setup happens once. The secrets module caches the decoded key on first
// use, so per-call env-var mutation would also be testing the cache —
// not the cipher. The tests that need a "missing key" path use
// `mock`/try/finally to temporarily unset it without nuking the cache.
test.before(() => {
  process.env.INSTANCE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
});

test('encrypt then decrypt round-trips a non-empty string', () => {
  const plaintext = 'sk_live_super_secret_value_42';
  const ciphertext = encryptSecret(plaintext);

  // Ciphertext must be a self-describing triple: iv.tag.body
  assert.equal(typeof ciphertext, 'string');
  assert.notEqual(ciphertext, plaintext);
  assert.equal(ciphertext.split('.').length, 3);

  const decrypted = decryptSecret(ciphertext);
  assert.equal(decrypted, plaintext);
});

test('encrypt produces different ciphertexts for the same plaintext (random IV)', () => {
  const plaintext = 'the same value, encrypted twice';
  const a = encryptSecret(plaintext);
  const b = encryptSecret(plaintext);

  // Two encryptions must produce two distinct ciphertexts — this is the
  // whole point of using a fresh 12-byte IV per call. If they ever
  // collide, the IV generator is broken (or someone is caching IVs).
  assert.notEqual(a, b);

  // Both must still round-trip back to the same plaintext.
  assert.equal(decryptSecret(a), plaintext);
  assert.equal(decryptSecret(b), plaintext);
});

test('decrypt throws on tampered ciphertext (third segment modified)', () => {
  const ciphertext = encryptSecret('hello world');
  const [iv, tag, body] = ciphertext.split('.');
  assert.ok(iv && tag && body);

  // Flip the first character of the body (ciphertext segment). GCM's
  // auth tag MUST catch this — the failure mode is "tampering detected"
  // not "garbage plaintext".
  const tamperedBody = (body[0] === 'A' ? 'B' : 'A') + body.slice(1);
  const tampered = `${iv}.${tag}.${tamperedBody}`;

  assert.throws(
    () => decryptSecret(tampered),
    (err: unknown) => err instanceof Error && err.message.startsWith('Failed to decrypt secret'),
  );
});

test('decrypt throws on tampered auth tag (second segment modified)', () => {
  const ciphertext = encryptSecret('hello world');
  const [iv, tag, body] = ciphertext.split('.');
  assert.ok(iv && tag && body);

  // Flip the first character of the auth tag.
  const tamperedTag = (tag[0] === 'A' ? 'B' : 'A') + tag.slice(1);
  const tampered = `${iv}.${tamperedTag}.${body}`;

  assert.throws(
    () => decryptSecret(tampered),
    (err: unknown) => err instanceof Error && err.message.startsWith('Failed to decrypt secret'),
  );
});

test('decrypt throws when a segment contains a non-base64 character', () => {
  // '!' is not a valid base64 char. The whole string is well-formed
  // structurally (3 dot-segments) but each segment is garbage.
  const garbage = '!!!.!!!.!!!';

  assert.throws(
    () => decryptSecret(garbage),
    (err: unknown) => err instanceof Error && err.message.startsWith('Failed to decrypt secret'),
  );
});

test('decrypt throws on the wrong number of dot-segments', () => {
  // Too few segments.
  assert.throws(
    () => decryptSecret('abc.def'),
    (err: unknown) => err instanceof Error && err.message.startsWith('Failed to decrypt secret'),
  );

  // Too many segments.
  assert.throws(
    () => decryptSecret('a.b.c.d'),
    (err: unknown) => err instanceof Error && err.message.startsWith('Failed to decrypt secret'),
  );
});

test("encrypt('') returns '' and decrypt('') returns ''", () => {
  // The empty string is a sentinel for "not configured" — it must
  // round-trip without ever calling the cipher, so the caller doesn't
  // need a key to test "no secret set".
  assert.equal(encryptSecret(''), '');
  assert.equal(decryptSecret(''), '');
});

test('encrypt and decrypt throw when INSTANCE_ENCRYPTION_KEY is missing', () => {
  const saved = process.env.INSTANCE_ENCRYPTION_KEY;
  // Unset the env var and bust the cache so the next encrypt/decrypt
  // call re-reads `process.env` and observes the missing key. The
  // cache exists by design (see secrets.ts docstring); rotation is
  // out of scope. This test verifies the *initial* fetch path, which
  // is the only one that can fail.
  delete process.env.INSTANCE_ENCRYPTION_KEY;
  __resetCachedKeyForTesting();

  // A well-formed base64 triple (12 + 16 + N bytes) so decrypt actually
  // reaches `resolveKey()` instead of short-circuiting on a malformed
  // structural check. 16 NUL bytes is enough to look valid to the
  // length checks; the GCM auth tag mismatch is irrelevant — the
  // missing key throws first.
  const fakeIv = Buffer.alloc(12).toString('base64');
  const fakeTag = Buffer.alloc(16).toString('base64');
  const fakeBody = Buffer.alloc(16).toString('base64');
  const wellShapedCiphertext = `${fakeIv}.${fakeTag}.${fakeBody}`;

  try {
    assert.throws(
      () => encryptSecret('anything'),
      (err: unknown) => err instanceof Error && /INSTANCE_ENCRYPTION_KEY/.test(err.message),
    );
    assert.throws(
      () => decryptSecret(wellShapedCiphertext),
      (err: unknown) => err instanceof Error && /INSTANCE_ENCRYPTION_KEY/.test(err.message),
    );
  } finally {
    process.env.INSTANCE_ENCRYPTION_KEY = saved;
    __resetCachedKeyForTesting();
  }
});

test('encrypt and decrypt throw when INSTANCE_ENCRYPTION_KEY is the wrong length', () => {
  const saved = process.env.INSTANCE_ENCRYPTION_KEY;
  // 16 bytes -> 24 base64 chars. Decodes to 16 bytes, not 32. Must
  // fail with the same "wrong length" error from getInstanceEncryptionKey.
  process.env.INSTANCE_ENCRYPTION_KEY = randomBytes(16).toString('base64');
  __resetCachedKeyForTesting();

  // Same well-formed base64 triple as above, so decrypt actually
  // reaches the key fetch and the wrong-length check fires.
  const fakeIv = Buffer.alloc(12).toString('base64');
  const fakeTag = Buffer.alloc(16).toString('base64');
  const fakeBody = Buffer.alloc(16).toString('base64');
  const wellShapedCiphertext = `${fakeIv}.${fakeTag}.${fakeBody}`;

  try {
    assert.throws(
      () => encryptSecret('anything'),
      (err: unknown) => err instanceof Error && /INSTANCE_ENCRYPTION_KEY/.test(err.message),
    );
    assert.throws(
      () => decryptSecret(wellShapedCiphertext),
      (err: unknown) => err instanceof Error && /INSTANCE_ENCRYPTION_KEY/.test(err.message),
    );
  } finally {
    process.env.INSTANCE_ENCRYPTION_KEY = saved;
    __resetCachedKeyForTesting();
  }
});

test("redact('any value') returns '[REDACTED]'", () => {
  assert.equal(redact('sk_live_abc123'), '[REDACTED]');
  assert.equal(redact(''), '[REDACTED]');
  // The function is intentionally idempotent and value-agnostic so
  // callers can use it in any error/log path without branching.
  assert.equal(redact(redact('x')), '[REDACTED]');
});
