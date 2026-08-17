import test from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDeleteLinkedAccount,
  type LinkedAccountHandlerDeps,
  type LinkedAccountHandlerSession,
} from '../route.ts';
import {
  handleLinkedOAuthSignIn,
  type LinkedOAuthSignInDeps,
  type WithWorkspaceLinkLock,
  type WorkspaceLinkTransaction,
} from '../../../../lib/auth.ts';

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
    withWorkspaceLinkLock: async (_channelId, operation) =>
      operation(deps.prisma as unknown as WorkspaceLinkTransaction),
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

test('last Twitch disconnect waits for an in-flight link before deciding workspace teardown', async () => {
  const accounts = [accountRow()];
  let lockTail = Promise.resolve();
  const withWorkspaceLock: WithWorkspaceLinkLock = async (_channelId, operation) => {
    const previous = lockTail;
    let release!: () => void;
    lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation(transaction);
    } finally {
      release();
    }
  };
  const transaction = {
    linkedAccount: {
      findFirst: async (args: { where: { id: string; userId: string } }) =>
        accounts.find(
          (candidate) => candidate.id === args.where.id && candidate.userId === args.where.userId,
        ) ?? null,
      findUnique: async (args: {
        where: { userId_platform_platformAccountId: { platformAccountId: string } };
      }) =>
        accounts.find(
          (candidate) =>
            candidate.platformAccountId ===
            args.where.userId_platform_platformAccountId.platformAccountId,
        ) ?? null,
      count: async (args: {
        where: { channelId?: string; userId?: string; platform: string; isActive?: boolean };
      }) =>
        accounts.filter(
          (candidate) =>
            candidate.platform === args.where.platform &&
            (!args.where.channelId || candidate.channelId === args.where.channelId) &&
            (!args.where.userId || candidate.userId === args.where.userId) &&
            (args.where.isActive === undefined || candidate.isActive === args.where.isActive),
        ).length,
      upsert: async (args: { create: ReturnType<typeof accountRow> }) => {
        accounts.push({ ...args.create, id: 'linked-account' });
        return {};
      },
      update: async (args: { where: { id: string } }) => {
        const candidate = accounts.find((entry) => entry.id === args.where.id)!;
        candidate.isActive = false;
        candidate.isPrimary = false;
        return candidate;
      },
    },
  } as unknown as WorkspaceLinkTransaction;

  let releaseProvision!: () => void;
  const provisionMayFinish = new Promise<void>((resolve) => {
    releaseProvision = resolve;
  });
  let signalProvisionStarted!: () => void;
  const provisionStarted = new Promise<void>((resolve) => {
    signalProvisionStarted = resolve;
  });
  const calls = { broadcasterTeardown: 0, workspaceTeardown: 0 };
  const prisma = {
    user: { findUnique: async () => ({ id: 'owner-1', role: 'owner' }) },
    linkedAccount: {
      findFirst: transaction.linkedAccount.findFirst,
    },
  } as unknown as LinkedAccountHandlerDeps['prisma'];
  const linkDeps: LinkedOAuthSignInDeps = {
    prisma: prisma as LinkedOAuthSignInDeps['prisma'],
    canManageChannelCredentials: async () => true,
    resolveYoutubeChannel: async () => null,
    provisionLinkedAccount: async () => {
      signalProvisionStarted();
      await provisionMayFinish;
    },
    withWorkspaceLinkLock: withWorkspaceLock,
    encrypt: (value) => `encrypted:${value}`,
  };
  const disconnectDeps: LinkedAccountHandlerDeps = {
    prisma,
    canManageChannelCredentials: async () => true,
    teardownTwitchBroadcasterEventSub: async () => {
      calls.broadcasterTeardown += 1;
    },
    teardownTwitchEventSub: async () => {
      calls.workspaceTeardown += 1;
    },
    teardownYoutubeWebSub: async () => {},
    withWorkspaceLinkLock: withWorkspaceLock,
    encrypt: () => 'empty-token-ciphertext',
  };

  const linking = handleLinkedOAuthSignIn(
    {
      account: {
        provider: 'twitch',
        providerAccountId: 'broadcaster-3',
        access_token: 'access-token',
      },
      profile: { login: 'ThirdBroadcaster' },
      linkingState: { userId: 'owner-1', channelId: 'channel-1' },
    },
    linkDeps,
  );
  await provisionStarted;

  const disconnecting = handleDeleteLinkedAccount({
    id: 'account-2',
    session,
    deps: disconnectDeps,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(calls.broadcasterTeardown, 0, 'disconnect must wait for link provisioning');

  releaseProvision();
  const [linked, disconnected] = await Promise.all([linking, disconnecting]);

  assert.equal(linked, true);
  assert.equal(disconnected.status, 200);
  assert.equal(calls.broadcasterTeardown, 1);
  assert.equal(calls.workspaceTeardown, 0, 'the newly linked broadcaster keeps shared state alive');
  assert.equal(accounts.filter((candidate) => candidate.isActive).length, 1);
});
