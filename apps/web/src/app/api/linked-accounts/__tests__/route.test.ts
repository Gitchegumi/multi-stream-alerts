import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDeleteLinkedAccount,
  type LinkedAccountHandlerDeps,
  type LinkedAccountHandlerSession,
} from '../route.ts';

const session: LinkedAccountHandlerSession = {
  user: { id: 'owner-1', role: 'owner' },
};

function accountRow() {
  return {
    id: 'account-2',
    userId: 'owner-1',
    channelId: 'channel-1',
    platform: 'twitch',
    platformAccountId: 'broadcaster-2',
    platformAccountName: 'SecondBroadcaster',
    encryptedAccessToken: 'ciphertext',
    encryptedRefreshToken: 'refresh-ciphertext',
    tokenExpiresAt: null,
    isActive: true,
    isPrimary: false,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function makeDeps({
  canManage = true,
  remaining = 1,
  broadcasterTeardownError,
}: {
  canManage?: boolean;
  remaining?: number;
  broadcasterTeardownError?: Error;
} = {}) {
  const calls = {
    accountUpdated: 0,
    broadcasterTeardown: 0,
    workspaceTeardown: 0,
  };
  const row = accountRow();
  const deps: LinkedAccountHandlerDeps = {
    prisma: {
      linkedAccount: {
        findFirst: async () => row,
        update: async () => {
          calls.accountUpdated += 1;
          return { ...row, isActive: false, isPrimary: false };
        },
        count: async () => remaining,
      },
      channel: {
        findUnique: async () => ({ slug: 'main' }),
      },
    } as unknown as LinkedAccountHandlerDeps['prisma'],
    canManageChannelCredentials: async () => canManage,
    teardownTwitchBroadcasterEventSub: async () => {
      calls.broadcasterTeardown += 1;
      if (broadcasterTeardownError) throw broadcasterTeardownError;
    },
    teardownTwitchEventSub: async () => {
      calls.workspaceTeardown += 1;
    },
    teardownYoutubeWebSub: async () => {},
    encrypt: () => 'empty-token-ciphertext',
  };
  return { deps, calls };
}

test('partial Twitch disconnect preserves account state when remote deletion fails', async () => {
  const { deps, calls } = makeDeps({
    broadcasterTeardownError: new Error('Twitch rejected a DELETE'),
  });

  const result = await handleDeleteLinkedAccount({ id: 'account-2', session, deps });

  assert.equal(result.status, 502);
  assert.equal(calls.accountUpdated, 0, 'OAuth tokens and active state must remain for retry');
  assert.equal(calls.workspaceTeardown, 0, 'remaining broadcasters must never be rebuilt');
});

test('partial Twitch disconnect removes only the selected broadcaster', async () => {
  const { deps, calls } = makeDeps({ remaining: 1 });

  const result = await handleDeleteLinkedAccount({ id: 'account-2', session, deps });

  assert.equal(result.status, 200);
  assert.equal(calls.broadcasterTeardown, 1);
  assert.equal(calls.accountUpdated, 1);
  assert.equal(
    calls.workspaceTeardown,
    0,
    'the shared secret and remaining broadcaster subscriptions must be preserved',
  );
});

test('disconnect rechecks current workspace credential authority', async () => {
  const { deps, calls } = makeDeps({ canManage: false });

  const result = await handleDeleteLinkedAccount({ id: 'account-2', session, deps });

  assert.equal(result.status, 403);
  assert.equal(calls.broadcasterTeardown, 0);
  assert.equal(calls.accountUpdated, 0);
});
