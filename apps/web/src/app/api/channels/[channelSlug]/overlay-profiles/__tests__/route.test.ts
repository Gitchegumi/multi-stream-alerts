import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, type HandlerDeps, type HandlerSession } from '../route.ts';

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

function makeProfileRow(
  overrides: Partial<{
    id: string;
    slug: string;
    name: string;
    displayKey: string;
    isActive: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 'profile-1',
    channelId: 'channel-1',
    name: overrides.name ?? 'Main',
    slug: overrides.slug ?? 'main',
    displayKey: overrides.displayKey ?? 'key-123',
    isActive: overrides.isActive ?? true,
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
      findMany: (args: {
        where: { channelId: string };
        orderBy: { createdAt: 'asc' };
      }) => Promise<ReturnType<typeof makeProfileRow>[]>;
    };
  };
  canManageChannel: (userId: string, role: string, channelId: string) => Promise<boolean>;
};

function makeDeps(overrides: Partial<MockDeps> = {}): HandlerDeps {
  const deps: MockDeps = {
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findMany: async () => [makeProfileRow()],
      },
    },
    canManageChannel: async () => true,
    ...overrides,
  };
  return deps as unknown as HandlerDeps;
}

// ---------------------------------------------------------------------------
// 1. GET returns 200 with the profile list shape
// ---------------------------------------------------------------------------

test('handleGet returns 200 with the profile list shape', async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findMany: async () => [
          makeProfileRow({
            id: 'p1',
            slug: 'main',
            name: 'Main',
            displayKey: 'key-a',
            isActive: true,
          }),
          makeProfileRow({
            id: 'p2',
            slug: 'vertical',
            name: 'Vertical',
            displayKey: 'key-b',
            isActive: false,
          }),
        ],
      },
    },
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: 'main',
    deps,
  });

  assert.equal(result.status, 200);
  const body = result.body as {
    profiles: Array<{
      id: string;
      name: string;
      slug: string;
      displayKey: string;
      isActive: boolean;
      url: string;
    }>;
  };
  assert.equal(body.profiles.length, 2);
  assert.deepEqual(body.profiles[0], {
    id: 'p1',
    name: 'Main',
    slug: 'main',
    displayKey: 'key-a',
    isActive: true,
    url: '/overlay/main?displayKey=key-a',
  });
  assert.deepEqual(body.profiles[1], {
    id: 'p2',
    name: 'Vertical',
    slug: 'vertical',
    displayKey: 'key-b',
    isActive: false,
    url: '/overlay/vertical?displayKey=key-b',
  });
  assert.equal(result.headers?.['Cache-Control'], 'no-store');
});

// ---------------------------------------------------------------------------
// 2. GET returns 404 when the channel slug does not resolve
// ---------------------------------------------------------------------------

test('handleGet returns 404 when the channel slug does not resolve', async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => null,
      },
      overlayProfile: {
        findMany: async () => [],
      },
    },
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: 'does-not-exist',
    deps,
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: 'Channel not found' });
});

// ---------------------------------------------------------------------------
// 3. GET returns 403 when the caller cannot manage the channel
// ---------------------------------------------------------------------------

test('handleGet returns 403 when the caller cannot manage the channel', async () => {
  const deps = makeDeps({
    canManageChannel: async () => false,
  });

  const result = await handleGet({
    session: makeSession('viewer'),
    channelSlug: 'main',
    deps,
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Channel access denied' });
});

// ---------------------------------------------------------------------------
// 4. GET returns empty profiles array when channel has no profiles
// ---------------------------------------------------------------------------

test('handleGet returns empty profiles array when channel has no profiles', async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findMany: async () => [],
      },
    },
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: 'main',
    deps,
  });

  assert.equal(result.status, 200);
  const body = result.body as { profiles: unknown[] };
  assert.deepEqual(body.profiles, []);
});
