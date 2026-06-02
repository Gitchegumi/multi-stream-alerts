import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInviteCodeForCookie, MAX_INVITE_CODE_BYTES } from '../oidc-state.ts';

test('validateInviteCodeForCookie accepts a normal code and normalizes it', () => {
  const result = validateInviteCodeForCookie('abcd-efgh-jklm');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.inviteCode, 'ABCD-EFGH-JKLM');
  }
});

test('validateInviteCodeForCookie trims surrounding whitespace', () => {
  const result = validateInviteCodeForCookie('  ABCD-EFGH-JKLM  \n');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.inviteCode, 'ABCD-EFGH-JKLM');
  }
});

test('validateInviteCodeForCookie rejects empty input', () => {
  assert.equal(validateInviteCodeForCookie('').ok, false);
  assert.equal(validateInviteCodeForCookie('   ').ok, false);
  assert.equal(validateInviteCodeForCookie(null).ok, false);
  assert.equal(validateInviteCodeForCookie(undefined).ok, false);
});

test('validateInviteCodeForCookie rejects input that normalizes to empty', () => {
  // After normalization (upper-case + strip non-[A-Z0-9-]) nothing remains.
  const result = validateInviteCodeForCookie('!@#$%');
  assert.equal(result.ok, false);
});

test('validateInviteCodeForCookie drops non-allowed characters during normalization', () => {
  // Lowercase letters and `_` are normalized out.
  const result = validateInviteCodeForCookie('abcd_efgh!jklm');
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.inviteCode, 'ABCDEFGHJKLM');
  }
});

test('validateInviteCodeForCookie rejects oversized input', () => {
  const huge = 'A'.repeat(MAX_INVITE_CODE_BYTES + 1);
  const result = validateInviteCodeForCookie(huge);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, 'TOO_LONG');
  }
});
