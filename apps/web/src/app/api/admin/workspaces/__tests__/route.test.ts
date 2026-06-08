import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, type HandlerDeps } from '../route.ts';

function makeDeps(overrides: { role?: string | null; userId?: string; channels?: unknown[] } = {}) {
  return {
    getServerSession: async () => {
      if (!overrides.role) return null;
      return { user: { id: overrides.userId ?? 'u-1', role: overrides.role } };
    },
    prisma: {
      channel: {
        findMany: async () => overrides.channels ?? [],
      },
    },
  } as unknown as HandlerDeps;
}

test('GET returns 401 when unauthenticated', async () => {
  const deps = makeDeps({ role: null });
  const res = await handleGet(deps);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.error, 'Authentication required');
});

test('GET returns 403 for non-admin user', async () => {
  const deps = makeDeps({ role: 'owner' });
  const res = await handleGet(deps);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, 'Admin access required');
});

test('GET returns workspace metadata for admin', async () => {
  const createdAt = new Date('2026-06-01T00:00:00.000Z');
  const updatedAt = new Date('2026-06-05T12:00:00.000Z');
  const deps = makeDeps({
    role: 'admin',
    userId: 'admin-1',
    channels: [
      {
        id: 'ch-1',
        name: 'Test Channel',
        slug: 'test-channel',
        createdAt,
        updatedAt,
        ownerUserId: 'owner-1',
        owner: { id: 'owner-1', email: 'owner@example.com', displayName: 'Owner Name' },
        _count: { memberships: 3 },
      },
    ],
  });
  const res = await handleGet(deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  assert.equal(body.workspaces.length, 1);
  const ws = body.workspaces[0];
  assert.equal(ws.id, 'ch-1');
  assert.equal(ws.name, 'Test Channel');
  assert.equal(ws.slug, 'test-channel');
  assert.equal(ws.createdAt, '2026-06-01T00:00:00.000Z');
  assert.equal(ws.updatedAt, '2026-06-05T12:00:00.000Z');
  assert.deepStrictEqual(ws.owner, {
    id: 'owner-1',
    email: 'owner@example.com',
    displayName: 'Owner Name',
  });
  assert.equal(ws.memberCount, 3);
});

test('GET handles workspace without owner', async () => {
  const deps = makeDeps({
    role: 'admin',
    userId: 'admin-1',
    channels: [
      {
        id: 'ch-2',
        name: 'Orphan Channel',
        slug: 'orphan',
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedAt: new Date('2026-06-05T12:00:00.000Z'),
        ownerUserId: null,
        owner: null,
        _count: { memberships: 0 },
      },
    ],
  });
  const res = await handleGet(deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 1);
  const ws = body.workspaces[0];
  assert.equal(ws.owner, null);
  assert.equal(ws.memberCount, 0);
});
