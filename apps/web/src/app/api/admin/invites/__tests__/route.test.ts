import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDelete, type HandlerDeps } from '../route.ts';

function makeInvite(overrides: Partial<{ id: string; isRevoked: boolean }> = {}) {
  return {
    id: overrides.id ?? 'invite-1',
    code: 'ABCD-EFGH',
    role: 'owner' as const,
    maxUses: 1,
    usedCount: 0,
    expiresAt: null,
    isRevoked: overrides.isRevoked ?? true,
    note: null,
    createdByUserId: 'admin-1',
    createdAt: new Date('2026-06-04T00:00:00.000Z'),
    identityProviderInvite: null,
  };
}

function makeDeps(
  overrides: Partial<{
    revokedDeleteCount: number;
    bulkDeleteCount: number;
    revokedInvite: ReturnType<typeof makeInvite> | null;
  }> = {},
) {
  const calls = {
    revokeInviteCode: [] as string[],
    purgeRevokedInviteCode: [] as string[],
    purgeRevokedInviteCodes: 0,
  };
  const deps = {
    revokeInviteCode: async (id: string) => {
      calls.revokeInviteCode.push(id);
      return overrides.revokedInvite === undefined ? makeInvite({ id }) : overrides.revokedInvite;
    },
    purgeRevokedInviteCode: async (id: string) => {
      calls.purgeRevokedInviteCode.push(id);
      return overrides.revokedDeleteCount ?? 1;
    },
    purgeRevokedInviteCodes: async () => {
      calls.purgeRevokedInviteCodes += 1;
      return overrides.bulkDeleteCount ?? 2;
    },
  };
  return { deps: deps as HandlerDeps, calls };
}

test('handleDelete keeps legacy DELETE { id } behavior as revoke', async () => {
  const { deps, calls } = makeDeps();
  const result = await handleDelete({ rawBody: { id: 'invite-1' }, deps });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.revokeInviteCode, ['invite-1']);
  assert.deepEqual(calls.purgeRevokedInviteCode, []);
  assert.equal(calls.purgeRevokedInviteCodes, 0);
  assert.deepEqual(result.body, { code: makeInvite({ id: 'invite-1' }) });
});

test('handleDelete purges a single revoked invite by id', async () => {
  const { deps, calls } = makeDeps({ revokedDeleteCount: 1 });
  const result = await handleDelete({
    rawBody: { action: 'purge_revoked', id: 'invite-1' },
    deps,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(calls.purgeRevokedInviteCode, ['invite-1']);
  assert.deepEqual(result.body, { deletedCount: 1 });
});

test('handleDelete returns 404 when no revoked invite was purged', async () => {
  const { deps } = makeDeps({ revokedDeleteCount: 0 });
  const result = await handleDelete({
    rawBody: { action: 'purge_revoked', id: 'active-invite' },
    deps,
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: 'Revoked invite code not found' });
});

test('handleDelete purges all revoked invites without touching revoke path', async () => {
  const { deps, calls } = makeDeps({ bulkDeleteCount: 3 });
  const result = await handleDelete({
    rawBody: { action: 'purge_all_revoked' },
    deps,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { deletedCount: 3 });
  assert.equal(calls.purgeRevokedInviteCodes, 1);
  assert.deepEqual(calls.revokeInviteCode, []);
  assert.deepEqual(calls.purgeRevokedInviteCode, []);
});

test('handleDelete rejects malformed purge payloads', async () => {
  const { deps, calls } = makeDeps();
  const result = await handleDelete({
    rawBody: { action: 'purge_revoked' },
    deps,
  });

  assert.equal(result.status, 400);
  assert.deepEqual(result.body, { error: 'Invalid invite delete payload' });
  assert.deepEqual(calls.revokeInviteCode, []);
  assert.deepEqual(calls.purgeRevokedInviteCode, []);
  assert.equal(calls.purgeRevokedInviteCodes, 0);
});
