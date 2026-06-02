import test from "node:test";
import assert from "node:assert/strict";
import { generateInviteCode, assertInviteIsUsable, InviteCodeError } from "../invites.ts";

// NOTE: `redeemInviteCode` is intentionally not covered here because it
// requires a real Prisma client. The atomic-race-condition logic inside
// its `$transaction` callback needs an integration test against a live
// (or test-spun) Postgres. Track that as a follow-up — pure unit coverage
// of validation + generation is enough to keep the public shape pinned.

test("generateInviteCode returns a normalized, alphanumeric+dash string", () => {
  for (let i = 0; i < 50; i++) {
    const code = generateInviteCode();
    // Expected shape: groups of letters/digits separated by dashes,
    // never containing lookalikes (0, O, 1, I, L).
    assert.match(code, /^[A-HJ-NP-Z2-9]+(?:-[A-HJ-NP-Z2-9]+)*$/);
    assert.equal(/[0O1IL]/.test(code), false);
  }
});

test("generateInviteCode respects requested length", () => {
  const short = generateInviteCode(8);
  const long = generateInviteCode(32);
  assert.ok(short.length >= 8);
  assert.ok(long.length >= 32);
});

test("generateInviteCode rejects absurd lengths by clamping", () => {
  // Should not throw
  const tiny = generateInviteCode(1);
  const huge = generateInviteCode(9999);
  assert.ok(tiny.length >= 8);
  assert.ok(huge.length <= 64);
});

test("assertInviteIsUsable accepts a fresh code", () => {
  assert.doesNotThrow(() =>
    assertInviteIsUsable({ isRevoked: false, usedCount: 0, maxUses: 1, expiresAt: null })
  );
});

test("assertInviteIsUsable rejects revoked codes", () => {
  assert.throws(
    () => assertInviteIsUsable({ isRevoked: true, usedCount: 0, maxUses: 5, expiresAt: null }),
    (err: unknown) => err instanceof InviteCodeError && err.code === "REVOKED"
  );
});

test("assertInviteIsUsable rejects expired codes", () => {
  assert.throws(
    () =>
      assertInviteIsUsable({
        isRevoked: false,
        usedCount: 0,
        maxUses: 5,
        expiresAt: new Date(Date.now() - 1000)
      }),
    (err: unknown) => err instanceof InviteCodeError && err.code === "EXPIRED"
  );
});

test("assertInviteIsUsable rejects exhausted codes", () => {
  assert.throws(
    () => assertInviteIsUsable({ isRevoked: false, usedCount: 1, maxUses: 1, expiresAt: null }),
    (err: unknown) => err instanceof InviteCodeError && err.code === "EXHAUSTED"
  );
});

test("InviteCodeError carries a stable machine-readable code", () => {
  for (const code of ["INVALID", "EXPIRED", "REVOKED", "EXHAUSTED"] as const) {
    const err = new InviteCodeError(code, `Test ${code}`);
    assert.equal(err.code, code);
    assert.equal(err.message, `Test ${code}`);
    assert.equal(err.name, "InviteCodeError");
    assert.ok(err instanceof Error);
  }
});
