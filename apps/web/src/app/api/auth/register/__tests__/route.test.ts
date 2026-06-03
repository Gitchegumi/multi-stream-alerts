import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleRegister, type HandlerDeps, setCredentialsEnabled } from '../route.ts';
import { InviteCodeError } from '@multi-stream-alerts/database';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  return {
    prisma: {
      user: {
        findUnique: mock.fn(async () => null),
      },
      $transaction: mock.fn(async (fn: unknown) => {
        const tx = makeTx();
        return (fn as (tx: ReturnType<typeof makeTx>) => Promise<unknown>)(tx);
      }),
    },
    createChannelWithUniqueSlug: mock.fn(async (_tx, _name, _email, _ownerId) => ({
      id: 'channel-1',
      slug: 'test-12345678',
      name: 'Test Channel',
      ownerUserId: 'user-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    })),
    hashPassword: mock.fn(() => 'scrypt$salt$hash'),
    redeemInviteCodeInTransaction: mock.fn(async () => ({
      invite: {
        id: 'invite-1',
        code: 'ABCD-EFGH',
        role: 'owner',
        maxUses: 1,
        usedCount: 1,
        isRevoked: false,
        expiresAt: null,
        note: null,
        createdByUserId: 'admin-1',
        createdAt: new Date(),
      },
      role: 'owner',
    })),
    assertInviteIsUsable: mock.fn(() => undefined),
    ...overrides,
  } as unknown as HandlerDeps;
}

function makeTx() {
  const freshInvite = {
    id: 'invite-1',
    code: 'ABCD-EFGH',
    role: 'owner' as const,
    maxUses: 1,
    usedCount: 0,
    isRevoked: false,
    expiresAt: null,
    note: null,
    createdByUserId: 'admin-1',
    createdAt: new Date(),
  };

  return {
    inviteCode: {
      findUnique: mock.fn(async () => freshInvite),
    },
    user: {
      create: mock.fn(async () => ({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'test',
        role: 'viewer',
        passwordHash: 'scrypt$salt$hash',
      })),
      update: mock.fn(async () => null),
    },
    localCredential: {
      create: mock.fn(async () => ({ id: 'lc-1' })),
    },
    channelMembership: {
      create: mock.fn(async () => ({
        id: 'membership-1',
        channelId: 'channel-1',
        userId: 'user-1',
        role: 'owner',
      })),
    },
  } as unknown as {
    inviteCode: {
      findUnique: (args: { where: { code: string } }) => Promise<typeof freshInvite | null>;
    };
    user: {
      create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
    };
    channelMembership: {
      create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    };
  };
}

// ---------------------------------------------------------------------------
// Valid registration
// ---------------------------------------------------------------------------

test('POST returns 200 and { ok: true } for valid registration', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps();
  const request = makeRequest({
    inviteCode: 'ABCD-EFGH',
    email: 'test@example.com',
    password: 'secure-password',
  });
  const response = await handleRegister(request, deps);
  assert.equal(response.status, 200);
  const json = (await response.json()) as { ok: boolean };
  assert.equal(json.ok, true);
});

// ---------------------------------------------------------------------------
// Duplicate email
// ---------------------------------------------------------------------------

test('POST returns 409 when the email is already taken', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps({
    prisma: {
      ...makeDeps().prisma,
      user: {
        findUnique: mock.fn(async () => ({
          id: 'existing-user',
          email: 'test@example.com',
          passwordHash: 'scrypt$salt$hash',
        })),
      },
    } as unknown as HandlerDeps['prisma'],
  });

  const request = makeRequest({
    inviteCode: 'ABCD-EFGH',
    email: 'test@example.com',
    password: 'secure-password',
  });

  const response = await handleRegister(request, deps);
  assert.equal(response.status, 409);
  const json = (await response.json()) as { error: string };
  assert.ok(json.error.toLowerCase().includes('already exists'));
});

// ---------------------------------------------------------------------------
// Bad invite code
// ---------------------------------------------------------------------------

test('POST returns 400 when the invite code is not found', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps({
    prisma: {
      ...makeDeps().prisma,
      $transaction: mock.fn(async (fn: unknown) => {
        const tx = {
          inviteCode: {
            findUnique: mock.fn(async () => null),
          },
          user: { create: mock.fn(), update: mock.fn() },
          channelMembership: { create: mock.fn() },
        } as unknown as ReturnType<typeof makeTx>;
        return (fn as (tx: ReturnType<typeof makeTx>) => Promise<unknown>)(tx);
      }),
    } as unknown as HandlerDeps['prisma'],
  });

  const request = makeRequest({
    inviteCode: 'ZZZZ-ZZZZ',
    email: 'new@example.com',
    password: 'secure-password',
  });

  const response = await handleRegister(request, deps);
  assert.equal(response.status, 400);
  const json = (await response.json()) as { error: string };
  assert.ok(json.error.toLowerCase().includes('invite code'));
});

// ---------------------------------------------------------------------------
// Validation failures
// ---------------------------------------------------------------------------

test('POST returns 400 for missing invite code', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps();
  const request = makeRequest({
    inviteCode: '',
    email: 'new@example.com',
    password: 'secure-password',
  });
  const response = await handleRegister(request, deps);
  assert.equal(response.status, 400);
});

test('POST returns 400 for malformed email', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps();
  const request = makeRequest({
    inviteCode: 'ABCD-EFGH',
    email: 'not-an-email',
    password: 'secure-password',
  });
  const response = await handleRegister(request, deps);
  assert.equal(response.status, 400);
});

test('POST returns 400 for short password', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps();
  const request = makeRequest({
    inviteCode: 'ABCD-EFGH',
    email: 'new@example.com',
    password: '123',
  });
  const response = await handleRegister(request, deps);
  assert.equal(response.status, 400);
});

// ---------------------------------------------------------------------------
// Rate limit
// ---------------------------------------------------------------------------

test('POST returns 429 after repeated requests from the same IP', async () => {
  setCredentialsEnabled(true);
  const deps = makeDeps();
  const body = {
    inviteCode: 'ABCD-EFGH',
    email: 'a@b.com',
    password: 'secure-password',
  };

  // Burn through the 10-attempt window.
  for (let i = 0; i < 10; i += 1) {
    const req = makeRequest(body);
    await handleRegister(req, deps);
  }

  const req = makeRequest(body);
  const response = await handleRegister(req, deps);
  assert.equal(response.status, 429);
  const json = (await response.json()) as { error: string };
  assert.ok(json.error.toLowerCase().includes('too many'));
});
