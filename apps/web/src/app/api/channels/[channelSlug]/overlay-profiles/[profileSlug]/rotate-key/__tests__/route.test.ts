import test from 'node:test';
import assert from 'node:assert/strict';
import { handlePost, type HandlerDeps, type HandlerSession } from '../route.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(role: 'admin' | 'owner' | 'editor' | 'viewer' = 'admin'): HandlerSession {
  return { user: { id: 'user-1', role } };
}

function makeChannelRow(overrides: Partial<{ id: string; slug: string }> = {}) {
  return {
    id: overrides.id ?? 'channel-1',
    slug: overrides.slug ?? 'main',
    name: 'Main Channel',
    ownerUserId: 'user-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeProfileRow(overrides: Partial<{ id: string; slug: string; displayKey: string }> = {}) {
  return {
    id: overrides.id ?? 'profile-1',
    channelId: 'channel-1',
    name: 'Main',
    slug: overrides.slug ?? 'main',
    displayKey: overrides.displayKey ?? 'old-key-123',
    isActive: true,
    settingsJson: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

type MockDeps = {
  prisma: {
    channel: {
      findUnique: (args: {
        where: { slug: string };
      }) => Promise<ReturnType<typeof makeChannelRow> | null>;
    };
    overlayProfile: {
      findUnique: (args: {
        where: { channelId_slug: { channelId: string; slug: string } };
      }) => Promise<ReturnType<typeof makeProfileRow> | null>;
      update: (args: {
        where: { id: string };
        data: { displayKey: string };
      }) => Promise<ReturnType<typeof makeProfileRow>>;
    };
  };
  canManageChannel: (userId: string, role: string, channelId: string) => Promise<boolean>;
  generateKey: () => string;
};

function makeDeps(overrides: Partial<MockDeps> = {}): HandlerDeps {
  const deps: MockDeps = {
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findUnique: async () => makeProfileRow(),
        update: async (args) => ({
          ...makeProfileRow(),
          displayKey: args.data.displayKey,
        }),
      },
    },
    canManageChannel: async () => true,
    generateKey: () => 'new-generated-key-hex',
    ...overrides,
  };
  return deps as unknown as HandlerDeps;
}

// ---------------------------------------------------------------------------
// 1. POST returns 200 with new displayKey and ok: true
// ---------------------------------------------------------------------------

test('handlePost returns 200 with new displayKey and ok: true', async () => {
  const deps = makeDeps();
  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    deps,
  });

  assert.equal(result.status, 200);
  const body = result.body as { ok: boolean; displayKey: string };
  assert.equal(body.ok, true);
  assert.equal(body.displayKey, 'new-generated-key-hex');
  assert.equal(result.headers?.['Cache-Control'], 'no-store');
});

// ---------------------------------------------------------------------------
// 2. POST returns 404 when the channel slug does not resolve
// ---------------------------------------------------------------------------

test('handlePost returns 404 when the channel slug does not resolve', async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => null,
      },
      overlayProfile: {
        findUnique: async () => null,
        update: async (args) => ({ ...makeProfileRow(), displayKey: args.data.displayKey }),
      },
    },
  });

  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'does-not-exist',
    profileSlug: 'main',
    deps,
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: 'Channel not found' });
});

// ---------------------------------------------------------------------------
// 3. POST returns 403 when the caller cannot manage the channel
// ---------------------------------------------------------------------------

test('handlePost returns 403 when the caller cannot manage the channel', async () => {
  const deps = makeDeps({
    canManageChannel: async () => false,
  });

  const result = await handlePost({
    session: makeSession('viewer'),
    channelSlug: 'main',
    profileSlug: 'main',
    deps,
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Channel access denied' });
});

// ---------------------------------------------------------------------------
// 4. POST returns 404 when the profile slug does not resolve
// ---------------------------------------------------------------------------

test('handlePost returns 404 when the profile slug does not resolve', async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findUnique: async () => null,
        update: async (args) => ({ ...makeProfileRow(), displayKey: args.data.displayKey }),
      },
    },
  });

  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'does-not-exist',
    deps,
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: 'Profile not found' });
});

// ---------------------------------------------------------------------------
// 5. POST calls update with a newly generated key (hard cutover)
// ---------------------------------------------------------------------------

test('handlePost calls update with a newly generated key', async () => {
  let updatedKey: string | null = null;
  const deps = makeDeps({
    generateKey: () => 'fresh-key-123',
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findUnique: async () => makeProfileRow({ displayKey: 'old-key' }),
        update: async (args) => {
          updatedKey = args.data.displayKey;
          return { ...makeProfileRow(), displayKey: args.data.displayKey };
        },
      },
    },
  });

  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    deps,
  });

  assert.equal(result.status, 200);
  assert.equal(updatedKey, 'fresh-key-123');
});

// ---------------------------------------------------------------------------
// 6. POST does not call update when profile is missing (regression guard)
// ---------------------------------------------------------------------------

test('handlePost never calls update when profile is missing', async () => {
  let updateCalled = false;
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findUnique: async () => null,
        update: async () => {
          updateCalled = true;
          return makeProfileRow();
        },
      },
    },
  });

  await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'missing',
    deps,
  });

  assert.equal(updateCalled, false);
});
