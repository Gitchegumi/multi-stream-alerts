import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from '../password.ts';

test('hashPassword returns scrypt-prefixed string with salt and hash segments', () => {
  const hashed = hashPassword('correct-horse-battery-staple');
  assert.ok(hashed.startsWith('scrypt$'));
  const parts = hashed.split('$');
  assert.equal(parts.length, 3);
  assert.ok(parts[1]!.length > 0, 'salt segment must be non-empty');
  assert.ok(parts[2]!.length > 0, 'hash segment must be non-empty');
});

test('verifyPassword succeeds for the correct password', () => {
  const plain = 'my-super-secret';
  const hashed = hashPassword(plain);
  assert.equal(verifyPassword(plain, hashed), true);
});

test('verifyPassword fails for the wrong password', () => {
  const hashed = hashPassword('right-password');
  assert.equal(verifyPassword('wrong-password', hashed), false);
});

test('verifyPassword fails for a completely different stored hash', () => {
  assert.equal(verifyPassword('any-password', 'scrypt$abc$def'), false);
});

test('verifyPassword returns false for malformed stored strings', () => {
  assert.equal(verifyPassword('password', 'not-scrypt$abc$def'), false);
  assert.equal(verifyPassword('password', 'scrypt$only-one-segment'), false);
  assert.equal(verifyPassword('password', ''), false);
});

test('two hashes of the same plaintext are different (random salt)', () => {
  const plain = 'same-password';
  const a = hashPassword(plain);
  const b = hashPassword(plain);
  assert.notEqual(a, b);
  assert.equal(verifyPassword(plain, a), true);
  assert.equal(verifyPassword(plain, b), true);
});

test('hashPassword handles unicode passwords', () => {
  const plain = '🔐 pässwörd 日本語';
  const hashed = hashPassword(plain);
  assert.equal(verifyPassword(plain, hashed), true);
  assert.equal(verifyPassword('🔐 pässwörd 日本語', hashed), false);
});
