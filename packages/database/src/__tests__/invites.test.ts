import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { generateInviteCode, assertInviteIsUsable, InviteCodeError, redeemInviteCodeInTransaction } from "../invites.ts";

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

test("redeemInviteCodeInTransaction writes through the supplied transaction client", async () => {
  // Build a minimal in-memory Prisma.TransactionClient that records the
  // calls made by the in-transaction variant. We only stub the three
  // delegates the function actually uses.
  const callLog: { method: string; args: unknown }[] = [];
  const freshRow = {
    id: "invite-1",
    code: "ABCD-EFGH",
    role: "owner" as const,
    maxUses: 1,
    usedCount: 0,
    isRevoked: false,
    expiresAt: null,
    note: null,
    createdByUserId: "admin-1",
    createdAt: new Date("2026-01-01T00:00:00Z")
  };
  const updatedRow = { ...freshRow, usedCount: 1 };

  const tx = {
    inviteCode: {
      findUnique: mock.fn(async (args: unknown) => {
        callLog.push({ method: "inviteCode.findUnique", args });
        return freshRow;
      }),
      update: mock.fn(async (args: unknown) => {
        callLog.push({ method: "inviteCode.update", args });
        return updatedRow;
      })
    },
    inviteCodeRedemption: {
      create: mock.fn(async (args: unknown) => {
        callLog.push({ method: "inviteCodeRedemption.create", args });
        return { id: "redemption-1", inviteCodeId: freshRow.id, userId: "user-1" };
      })
    }
  };

  const result = await redeemInviteCodeInTransaction(tx as never, {
    invite: freshRow,
    userId: "user-1"
  });

  // Exactly three writes, in the right order.
  assert.equal(callLog.length, 3);
  assert.equal(callLog[0]!.method, "inviteCode.findUnique");
  assert.equal(callLog[1]!.method, "inviteCode.update");
  assert.equal(callLog[2]!.method, "inviteCodeRedemption.create");

  // The update should be the optimistic-lock update.
  const updateArgs = callLog[1]!.args as { where: { id: string; usedCount: number }; data: { usedCount: { increment: 1 } } };
  assert.equal(updateArgs.where.id, freshRow.id);
  assert.equal(updateArgs.where.usedCount, freshRow.usedCount);
  assert.deepEqual(updateArgs.data, { usedCount: { increment: 1 } });

  // The redemption row should reference the correct invite + user.
  const redemptionArgs = callLog[2]!.args as { data: { inviteCodeId: string; userId: string } };
  assert.equal(redemptionArgs.data.inviteCodeId, freshRow.id);
  assert.equal(redemptionArgs.data.userId, "user-1");

  assert.equal(result.role, "owner");
  assert.equal(result.invite.usedCount, 1);
});

test("redeemInviteCodeInTransaction throws INVALID when the invite is gone", async () => {
  const tx = {
    inviteCode: {
      findUnique: mock.fn(async () => null),
      update: mock.fn(),
      create: mock.fn()
    },
    inviteCodeRedemption: {
      create: mock.fn()
    }
  };

  await assert.rejects(
    () =>
      redeemInviteCodeInTransaction(tx as never, {
        invite: { id: "x", usedCount: 0, maxUses: 1, isRevoked: false, expiresAt: null, role: "viewer" },
        userId: "user-1"
      }),
    (err: unknown) => err instanceof InviteCodeError && err.code === "INVALID"
  );
});

test("redeemInviteCodeInTransaction throws REVOKED if the fresh row is revoked", async () => {
  const tx = {
    inviteCode: {
      findUnique: mock.fn(async () => ({
        id: "x",
        code: "ABCD",
        role: "owner",
        maxUses: 1,
        usedCount: 0,
        isRevoked: true,
        expiresAt: null,
        note: null,
        createdByUserId: "admin-1",
        createdAt: new Date()
      })),
      update: mock.fn(),
      create: mock.fn()
    },
    inviteCodeRedemption: {
      create: mock.fn()
    }
  };

  await assert.rejects(
    () =>
      redeemInviteCodeInTransaction(tx as never, {
        invite: { id: "x", usedCount: 0, maxUses: 1, isRevoked: false, expiresAt: null, role: "viewer" },
        userId: "user-1"
      }),
    (err: unknown) => err instanceof InviteCodeError && err.code === "REVOKED"
  );
});
