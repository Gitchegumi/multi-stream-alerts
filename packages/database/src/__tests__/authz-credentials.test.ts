import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import type { UserRole } from '@prisma/client';
import { canManageChannelCredentials } from '../authz';

// ---------------------------------------------------------------------------
// canManageChannelCredentials
// ---------------------------------------------------------------------------
//
// Same shape as canManageChannel, but the membership role allowlist is
// tighter: only admin (unconditional) or channel owner. Editors and
// viewers can NOT manage platform credentials, because credentials grant
// platform power (Twitch EventSub subscription, YouTube OAuth, Ko-fi
// webhook validation, etc.) and should require explicit channel
// ownership.
//
// We stub `prisma.channelMembership.findUnique` and verify the helper
// is called with `{ where: { channelId_userId: { channelId, userId } } }`.
// The admin short-circuit must not consult the membership table at all.

type MembershipRow = { channelId: string; userId: string; role: UserRole } | null;

function makePrismaStub(membership: MembershipRow) {
  const findUnique = mock.fn(async (args: unknown) => {
    // Record the call so tests can assert on the where clause shape.
    (findUnique as unknown as { lastArgs?: unknown }).lastArgs = args;
    return membership;
  });
  return {
    channelMembership: {
      findUnique,
    },
  };
}

async function withPrismaStub<T>(
  stub: ReturnType<typeof makePrismaStub>,
  fn: () => Promise<T>,
): Promise<T> {
  const { prisma } = await import('../client.ts');
  const original = prisma.channelMembership.findUnique;
  (prisma.channelMembership as unknown as { findUnique: unknown }).findUnique =
    stub.channelMembership.findUnique;
  try {
    return await fn();
  } finally {
    (prisma.channelMembership as unknown as { findUnique: unknown }).findUnique = original;
  }
}

test('canManageChannelCredentials returns true for an admin regardless of membership', async () => {
  const stub = makePrismaStub(null);
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('admin-user-1', 'admin', 'channel-1'),
  );
  assert.equal(result, true);
  // Admins must short-circuit BEFORE the membership lookup.
  assert.equal(
    stub.channelMembership.findUnique.mock.calls.length,
    0,
    'admin path must not consult the membership table',
  );
});

test('canManageChannelCredentials returns true for a channel owner', async () => {
  const stub = makePrismaStub({ channelId: 'channel-1', userId: 'owner-1', role: 'owner' });
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('owner-1', 'owner', 'channel-1'),
  );
  assert.equal(result, true);
  assert.equal(stub.channelMembership.findUnique.mock.calls.length, 1);
  const args = (stub.channelMembership.findUnique as unknown as { lastArgs?: unknown })
    .lastArgs as {
    where: { channelId_userId: { channelId: string; userId: string } };
  };
  assert.deepEqual(args.where, { channelId_userId: { channelId: 'channel-1', userId: 'owner-1' } });
});

test('canManageChannelCredentials returns false for an editor (not in the allowlist)', async () => {
  const stub = makePrismaStub({ channelId: 'channel-1', userId: 'editor-1', role: 'editor' });
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('editor-1', 'editor', 'channel-1'),
  );
  assert.equal(result, false);
  assert.equal(stub.channelMembership.findUnique.mock.calls.length, 1);
});

test('canManageChannelCredentials returns false for a viewer', async () => {
  const stub = makePrismaStub({ channelId: 'channel-1', userId: 'viewer-1', role: 'viewer' });
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('viewer-1', 'viewer', 'channel-1'),
  );
  assert.equal(result, false);
  assert.equal(stub.channelMembership.findUnique.mock.calls.length, 1);
});

test('canManageChannelCredentials returns false for a user with no membership at all', async () => {
  const stub = makePrismaStub(null);
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('stranger-1', 'viewer', 'channel-1'),
  );
  assert.equal(result, false);
  assert.equal(stub.channelMembership.findUnique.mock.calls.length, 1);
  const args = (stub.channelMembership.findUnique as unknown as { lastArgs?: unknown })
    .lastArgs as {
    where: { channelId_userId: { channelId: string; userId: string } };
  };
  assert.deepEqual(args.where, {
    channelId_userId: { channelId: 'channel-1', userId: 'stranger-1' },
  });
});

test("canManageChannelCredentials returns false for a non-admin user querying a different channel's id", async () => {
  // Owner of channel-1 must not be able to manage credentials on channel-2.
  // The membership lookup is keyed by the requested channelId, so the
  // returned row (or its absence) is what determines the answer.
  const stub = makePrismaStub(null);
  const result = await withPrismaStub(stub, () =>
    canManageChannelCredentials('owner-1', 'owner', 'channel-2'),
  );
  assert.equal(result, false);
  assert.equal(stub.channelMembership.findUnique.mock.calls.length, 1);
  const args = (stub.channelMembership.findUnique as unknown as { lastArgs?: unknown })
    .lastArgs as {
    where: { channelId_userId: { channelId: string; userId: string } };
  };
  assert.deepEqual(args.where, { channelId_userId: { channelId: 'channel-2', userId: 'owner-1' } });
});
