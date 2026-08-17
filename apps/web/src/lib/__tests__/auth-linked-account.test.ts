import test from 'node:test';
import assert from 'node:assert/strict';
import { handleLinkedOAuthSignIn, type LinkedOAuthSignInDeps } from '../auth.ts';

const account = {
  provider: 'twitch',
  providerAccountId: 'broadcaster-6',
  access_token: 'access-token',
  refresh_token: 'refresh-token',
};

function makeDeps({
  canManage = true,
  activeCount = 0,
  existing = null,
}: {
  canManage?: boolean;
  activeCount?: number;
  existing?: { channelId: string | null; isActive: boolean } | null;
} = {}) {
  const calls = { upserts: 0, provisions: 0 };
  let countCall = 0;
  const deps: LinkedOAuthSignInDeps = {
    prisma: {
      user: {
        findUnique: async () => ({ id: 'owner-1', role: 'owner' }),
      },
      linkedAccount: {
        findUnique: async () => existing,
        count: async () => {
          countCall += 1;
          return countCall === 1 ? activeCount : activeCount;
        },
        upsert: async () => {
          calls.upserts += 1;
          return {};
        },
      },
    } as unknown as LinkedOAuthSignInDeps['prisma'],
    canManageChannelCredentials: async () => canManage,
    resolveYoutubeChannel: async () => null,
    provisionLinkedAccount: async () => {
      calls.provisions += 1;
    },
    encrypt: (value) => `encrypted:${value}`,
  };
  return { deps, calls };
}

test('OAuth commitment rejects permission changes during the provider round trip', async () => {
  const { deps, calls } = makeDeps({ canManage: false });

  const accepted = await handleLinkedOAuthSignIn(
    {
      account,
      profile: { login: 'broadcaster' },
      linkingState: { userId: 'owner-1', channelId: 'channel-1' },
    },
    deps,
  );

  assert.equal(accepted, false);
  assert.equal(calls.upserts, 0);
  assert.equal(calls.provisions, 0);
});

test('OAuth commitment rejects a sixth active Twitch account', async () => {
  const { deps, calls } = makeDeps({ activeCount: 5 });

  const accepted = await handleLinkedOAuthSignIn(
    {
      account,
      profile: { login: 'broadcaster' },
      linkingState: { userId: 'owner-1', channelId: 'channel-1' },
    },
    deps,
  );

  assert.equal(accepted, false);
  assert.equal(calls.upserts, 0);
  assert.equal(calls.provisions, 0);
});

test('OAuth commitment allows the fifth active Twitch account', async () => {
  const { deps, calls } = makeDeps({ activeCount: 4 });

  const accepted = await handleLinkedOAuthSignIn(
    {
      account,
      profile: { login: 'broadcaster' },
      linkingState: { userId: 'owner-1', channelId: 'channel-1' },
    },
    deps,
  );

  assert.equal(accepted, true);
  assert.equal(calls.upserts, 1);
  assert.equal(calls.provisions, 1);
});

test('OAuth commitment allows an active account to reconnect at the cap', async () => {
  const { deps, calls } = makeDeps({
    activeCount: 5,
    existing: { channelId: 'channel-1', isActive: true },
  });

  const accepted = await handleLinkedOAuthSignIn(
    {
      account,
      profile: { login: 'broadcaster' },
      linkingState: { userId: 'owner-1', channelId: 'channel-1' },
    },
    deps,
  );

  assert.equal(accepted, true);
  assert.equal(calls.upserts, 1);
  assert.equal(calls.provisions, 1);
});
