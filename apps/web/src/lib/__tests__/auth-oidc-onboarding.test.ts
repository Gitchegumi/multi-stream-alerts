import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleOidcSignIn, type OidcSignInDeps } from '../auth.ts';

const account = { provider: 'oidc', providerAccountId: 'subject-1' };
const profile = {
  sub: 'subject-1',
  email: 'new@example.com',
  name: 'New User',
};

function makeDeps({
  existingUser = null,
  inviteCookie,
  env = {},
}: {
  existingUser?: { id: string; email: string; displayName: string | null } | null;
  inviteCookie?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}) {
  const cookieValue = inviteCookie === undefined ? 'ABCD-EFGH' : inviteCookie;
  const calls: Record<string, unknown[]> = {
    usersCreated: [],
    usersUpdated: [],
    membershipsCreated: [],
    inviteLookups: [],
    redemptions: [],
    channelsCreated: [],
  };

  const invite = {
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

  const tx = {
    inviteCode: {
      findUnique: mock.fn(async (args: unknown) => {
        calls.inviteLookups.push(args);
        return invite;
      }),
    },
    user: {
      create: mock.fn(async (args: { data: Record<string, unknown> }) => {
        calls.usersCreated.push(args);
        return { id: 'user-1', ...args.data };
      }),
      update: mock.fn(async (args: unknown) => {
        calls.usersUpdated.push(args);
        return null;
      }),
    },
    channelMembership: {
      create: mock.fn(async (args: unknown) => {
        calls.membershipsCreated.push(args);
        return { id: 'membership-1' };
      }),
    },
  };

  const deps = {
    prisma: {
      user: {
        findFirst: mock.fn(async () => existingUser),
        create: mock.fn(async (args: unknown) => {
          calls.usersCreated.push(args);
          return { id: 'user-1' };
        }),
        update: mock.fn(async (args: unknown) => {
          calls.usersUpdated.push(args);
          return null;
        }),
      },
      $transaction: mock.fn(async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)),
    },
    getInviteCookie: mock.fn(async () => cookieValue ?? undefined),
    deleteInviteCookie: mock.fn(async () => undefined),
    createChannelWithUniqueSlug: mock.fn(
      async (_tx: unknown, name: string, email: string, ownerUserId: string) => {
        calls.channelsCreated.push({ name, email, ownerUserId });
        return { id: 'channel-1', slug: 'new-12345678' };
      },
    ),
    redeemInviteCodeInTransaction: mock.fn(async (_tx: unknown, redemption: unknown) => {
      calls.redemptions.push(redemption);
      return { invite, role: 'owner' };
    }),
    assertInviteIsUsable: mock.fn(() => undefined),
    env: {
      INITIAL_ADMIN_EMAIL: 'admin@example.com',
      ...env,
    },
  } as unknown as OidcSignInDeps;

  return { deps, calls };
}

test('OIDC-only invite onboarding provisions an unknown user', async () => {
  const { deps, calls } = makeDeps({
    env: {
      AUTH_CREDENTIALS_ENABLED: 'false',
      ONBOARDING_ENABLED: 'true',
      ONBOARDING_REQUIRE_INVITE: 'true',
    },
  });

  const allowed = await handleOidcSignIn({ account, profile }, deps);

  assert.equal(allowed, true);
  assert.equal(calls.usersCreated.length, 1);
  assert.equal(calls.redemptions.length, 1);
  assert.equal(calls.channelsCreated.length, 1);
  assert.deepEqual(calls.membershipsCreated[0], {
    data: { channelId: 'channel-1', userId: 'user-1', role: 'owner' },
  });
});

test('unknown OIDC user without invite is rejected when invites are required', async () => {
  const { deps, calls } = makeDeps({
    inviteCookie: null,
    env: { ONBOARDING_REQUIRE_INVITE: 'true' },
  });

  const allowed = await handleOidcSignIn({ account, profile }, deps);

  assert.equal(allowed, false);
  assert.equal(calls.usersCreated.length, 0);
  assert.equal(calls.channelsCreated.length, 0);
});

test('unknown OIDC user without invite is created when invites are optional', async () => {
  const { deps, calls } = makeDeps({
    inviteCookie: null,
    env: {
      ONBOARDING_REQUIRE_INVITE: 'false',
      ONBOARDING_DEFAULT_WORKSPACE_ROLE: 'viewer',
    },
  });

  const allowed = await handleOidcSignIn({ account, profile }, deps);

  assert.equal(allowed, true);
  assert.equal(calls.redemptions.length, 0);
  assert.deepEqual(calls.usersCreated[0], {
    data: {
      authProvider: 'oidc',
      authSubject: 'subject-1',
      email: 'new@example.com',
      displayName: 'New User',
      role: 'viewer',
    },
  });
});

test('new OIDC invite user receives a personal channel and owner membership', async () => {
  const { deps, calls } = makeDeps();

  await handleOidcSignIn({ account, profile }, deps);

  assert.deepEqual(calls.channelsCreated[0], {
    name: 'New User',
    email: 'new@example.com',
    ownerUserId: 'user-1',
  });
  assert.deepEqual(calls.membershipsCreated[0], {
    data: { channelId: 'channel-1', userId: 'user-1', role: 'owner' },
  });
});

test('OIDC invite redemption preserves the invite app role', async () => {
  const { deps, calls } = makeDeps({
    env: { ONBOARDING_DEFAULT_WORKSPACE_ROLE: 'viewer' },
  });

  await handleOidcSignIn({ account, profile }, deps);

  assert.deepEqual(calls.usersUpdated[0], {
    where: { id: 'user-1' },
    data: { role: 'owner' },
  });
});

test('existing OIDC user signs in without an invite', async () => {
  const { deps, calls } = makeDeps({
    existingUser: {
      id: 'existing-1',
      email: 'new@example.com',
      displayName: 'Old Name',
    },
    inviteCookie: null,
  });

  const allowed = await handleOidcSignIn({ account, profile }, deps);

  assert.equal(allowed, true);
  assert.equal(calls.usersCreated.length, 0);
  assert.equal(calls.channelsCreated.length, 0);
  assert.deepEqual(calls.usersUpdated[0], {
    where: { id: 'existing-1' },
    data: {
      authProvider: 'oidc',
      authSubject: 'subject-1',
      displayName: 'New User',
    },
  });
});
