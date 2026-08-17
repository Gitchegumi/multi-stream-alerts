import test from 'node:test';
import assert from 'node:assert/strict';
import { provisionTwitchEventSub, type TwitchProvisionDeps } from '@multi-stream-alerts/database';
import {
  handleLinkedOAuthSignIn,
  withWorkspaceLinkLock,
  type LinkedOAuthSignInDeps,
  type WorkspaceLinkTransaction,
} from '../auth.ts';

const account = {
  provider: 'twitch',
  providerAccountId: 'broadcaster-6',
  access_token: 'access-token',
  refresh_token: 'refresh-token',
};

type ActiveAccount = {
  userId: string;
  channelId: string;
  platform: string;
  platformAccountId: string;
  isActive: boolean;
};

function makeAccountTransaction(activeAccounts: ActiveAccount[]): WorkspaceLinkTransaction {
  return {
    linkedAccount: {
      findUnique: async (args: {
        where: {
          userId_platform_platformAccountId: { platformAccountId: string };
        };
      }) =>
        activeAccounts.find(
          (candidate) =>
            candidate.platformAccountId ===
            args.where.userId_platform_platformAccountId.platformAccountId,
        ) ?? null,
      count: async (args: { where: { channelId?: string; userId?: string; platform: string } }) =>
        activeAccounts.filter(
          (candidate) =>
            candidate.platform === args.where.platform &&
            (!args.where.channelId || candidate.channelId === args.where.channelId) &&
            (!args.where.userId || candidate.userId === args.where.userId) &&
            candidate.isActive,
        ).length,
      upsert: async (args: { create: ActiveAccount }) => {
        activeAccounts.push({
          userId: args.create.userId,
          channelId: args.create.channelId,
          platform: args.create.platform,
          platformAccountId: args.create.platformAccountId,
          isActive: args.create.isActive,
        });
        return {};
      },
    },
  } as unknown as WorkspaceLinkTransaction;
}

function makeLockedDatabase(transaction: WorkspaceLinkTransaction) {
  let lockTail = Promise.resolve();
  const lockKeys: string[] = [];
  const database = {
    $transaction: async <T>(
      callback: (
        tx: WorkspaceLinkTransaction & {
          $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;
        },
      ) => Promise<T>,
    ): Promise<T> => {
      let releaseLock: (() => void) | undefined;
      const tx = {
        ...transaction,
        $queryRaw: async (_strings: TemplateStringsArray, ...values: unknown[]) => {
          lockKeys.push(String(values[0]));
          const previous = lockTail;
          lockTail = new Promise<void>((resolve) => {
            releaseLock = resolve;
          });
          await previous;
          return [];
        },
      };
      try {
        return await callback(tx);
      } finally {
        releaseLock?.();
      }
    },
  };
  return { database, lockKeys };
}

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
  const deps: LinkedOAuthSignInDeps = {
    prisma: {
      user: {
        findUnique: async () => ({ id: 'owner-1', role: 'owner' }),
      },
      linkedAccount: {
        findUnique: async () => existing,
        count: async () => activeCount,
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
    withWorkspaceLinkLock: async (_channelId, operation) =>
      operation(deps.prisma as unknown as WorkspaceLinkTransaction),
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

test('concurrent OAuth commitments cannot activate a sixth Twitch account', async () => {
  const activeAccounts: ActiveAccount[] = Array.from({ length: 4 }, (_, index) => ({
    userId: 'owner-1',
    channelId: 'channel-1',
    platform: 'twitch',
    platformAccountId: `existing-${index + 1}`,
    isActive: true,
  }));
  let provisions = 0;
  const transaction = makeAccountTransaction(activeAccounts);
  const { database, lockKeys } = makeLockedDatabase(transaction);

  const deps: LinkedOAuthSignInDeps = {
    prisma: {
      user: {
        findUnique: async () => ({ id: 'owner-1', role: 'owner' }),
      },
    } as unknown as LinkedOAuthSignInDeps['prisma'],
    canManageChannelCredentials: async () => true,
    resolveYoutubeChannel: async () => null,
    provisionLinkedAccount: async () => {
      provisions += 1;
    },
    withWorkspaceLinkLock: (channelId, operation) =>
      withWorkspaceLinkLock(
        channelId,
        operation,
        database as unknown as LinkedOAuthSignInDeps['prisma'],
      ),
    encrypt: (value) => `encrypted:${value}`,
  };

  const results = await Promise.all(
    ['broadcaster-5', 'broadcaster-6'].map((providerAccountId) =>
      handleLinkedOAuthSignIn(
        {
          account: { ...account, providerAccountId },
          profile: { login: providerAccountId },
          linkingState: { userId: 'owner-1', channelId: 'channel-1' },
        },
        deps,
      ),
    ),
  );

  assert.deepEqual(results.sort(), [false, true]);
  assert.equal(activeAccounts.length, 5);
  assert.equal(provisions, 1);
  assert.deepEqual(lockKeys, ['channel-1', 'channel-1']);
});

test('concurrent first Twitch links use one persisted EventSub secret', async () => {
  const activeAccounts: ActiveAccount[] = [];
  const transaction = makeAccountTransaction(activeAccounts);
  const { database } = makeLockedDatabase(transaction);
  const subscriptionSecrets: string[] = [];
  let persistedSecret: string | null = null;
  let generatedSecrets = 0;

  const twitchDeps: TwitchProvisionDeps = {
    env: {
      TWITCH_CLIENT_ID: 'client-id',
      INGRESS_PUBLIC_BASE_URL: 'https://alerts.example.com',
    } as NodeJS.ProcessEnv,
    getAppToken: async () => 'app-token',
    getEventSubSecret: async () => persistedSecret,
    generateSecret: () => `generated-secret-${++generatedSecrets}`,
    saveCredentials: (async (input: { secrets: Record<string, string> }) => {
      persistedSecret = input.secrets['twitch.eventsub_secret'] ?? null;
      return {} as never;
    }) as TwitchProvisionDeps['saveCredentials'],
    fetchFn: (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { transport: { secret: string } };
      subscriptionSecrets.push(body.transport.secret);
      return {
        ok: true,
        status: 202,
        json: async () => ({ data: [{ id: `subscription-${subscriptionSecrets.length}` }] }),
      } as Response;
    }) as typeof fetch,
    recordSubscription: async () => {},
    listSubscriptions: async () => [],
    deleteSubscriptionRecords: async () => {},
  };

  const deps: LinkedOAuthSignInDeps = {
    prisma: {
      user: {
        findUnique: async () => ({ id: 'owner-1', role: 'owner' }),
      },
    } as unknown as LinkedOAuthSignInDeps['prisma'],
    canManageChannelCredentials: async () => true,
    resolveYoutubeChannel: async () => null,
    provisionLinkedAccount: async (input) => {
      await provisionTwitchEventSub(
        { channelId: input.channelId!, broadcasterUserId: input.providerAccountId },
        twitchDeps,
      );
    },
    withWorkspaceLinkLock: (channelId, operation) =>
      withWorkspaceLinkLock(
        channelId,
        operation,
        database as unknown as LinkedOAuthSignInDeps['prisma'],
      ),
    encrypt: (value) => `encrypted:${value}`,
  };

  const results = await Promise.all(
    ['first-broadcaster', 'second-broadcaster'].map((providerAccountId) =>
      handleLinkedOAuthSignIn(
        {
          account: { ...account, providerAccountId },
          profile: { login: providerAccountId },
          linkingState: { userId: 'owner-1', channelId: 'channel-1' },
        },
        deps,
      ),
    ),
  );

  assert.deepEqual(results, [true, true]);
  assert.equal(activeAccounts.length, 2);
  assert.equal(generatedSecrets, 1);
  assert.equal(subscriptionSecrets.length, 14);
  assert.deepEqual([...new Set(subscriptionSecrets)], [persistedSecret]);
});
