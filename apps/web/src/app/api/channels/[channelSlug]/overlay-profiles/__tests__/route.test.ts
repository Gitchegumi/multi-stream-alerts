import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, handlePost, type HandlerDeps, type HandlerSession } from '../route.ts';

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
      findFirst: (args: {
        where: { channelId: string; slug: string };
        select?: { id: true };
      }) => Promise<ReturnType<typeof makeProfileRow> | { id: string } | null>;
      create: (args: {
        data: {
          channelId: string;
          name: string;
          slug: string;
          displayKey: string;
          isActive: boolean;
          settingsJson: object;
        };
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
        findMany: async () => [makeProfileRow()],
        findFirst: async () => null,
        create: async (args) =>
          makeProfileRow({
            name: args.data.name,
            slug: args.data.slug,
            displayKey: args.data.displayKey,
            isActive: args.data.isActive,
          }),
      },
    },
    canManageChannel: async () => true,
    generateKey: () => 'generated-display-key',
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
    url: '/overlay/main/main?displayKey=key-a',
  });
  assert.deepEqual(body.profiles[1], {
    id: 'p2',
    name: 'Vertical',
    slug: 'vertical',
    displayKey: 'key-b',
    isActive: false,
    url: '/overlay/main/vertical?displayKey=key-b',
  });
  assert.equal(result.headers?.['Cache-Control'], 'no-store');
});

test('handlePost creates a canvas with a unique slug and generated display key', async () => {
  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    body: { name: 'Main Overlay' },
    deps: makeDeps(),
  });

  assert.equal(result.status, 201);
  const body = result.body as { profile: ReturnType<typeof makeProfileRow> };
  assert.equal(body.profile.name, 'Main Overlay');
  assert.equal(body.profile.slug, 'main-overlay');
  assert.equal(body.profile.displayKey, 'generated-display-key');
  assert.equal(result.headers?.['Cache-Control'], 'no-store');
});

test('handlePost suffixes canvas slugs when the base slug is already used', async () => {
  const seenSlugs: string[] = [];
  const deps = makeDeps({
    prisma: {
      channel: { findUnique: async () => makeChannelRow() },
      overlayProfile: {
        findMany: async () => [],
        findFirst: async (args) => {
          seenSlugs.push(args.where.slug);
          return args.where.slug === 'main-overlay' ? { id: 'existing' } : null;
        },
        create: async (args) => makeProfileRow({ name: args.data.name, slug: args.data.slug }),
      },
    },
  });

  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    body: { name: 'Main Overlay' },
    deps,
  });

  assert.equal(result.status, 201);
  const body = result.body as { profile: ReturnType<typeof makeProfileRow> };
  assert.equal(body.profile.slug, 'main-overlay-2');
  assert.deepEqual(seenSlugs, ['main-overlay', 'main-overlay-2']);
});

test('handlePost duplicates source canvas settings when requested', async () => {
  const copiedSettings = {
    width: 1280,
    height: 720,
    background: 'dark',
    alertEventKeys: ['kofi.tipped'],
  };
  let createdSettings: object | null = null;
  const deps = makeDeps({
    prisma: {
      channel: { findUnique: async () => makeChannelRow() },
      overlayProfile: {
        findMany: async () => [],
        findFirst: async (args) =>
          args.where.slug === 'source'
            ? { ...makeProfileRow({ slug: 'source' }), settingsJson: copiedSettings }
            : null,
        create: async (args) => {
          createdSettings = args.data.settingsJson;
          return makeProfileRow({ name: args.data.name, slug: args.data.slug });
        },
      },
    },
  });

  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    body: { name: 'Source copy', duplicateFromSlug: 'source' },
    deps,
  });

  assert.equal(result.status, 201);
  assert.deepEqual(createdSettings, copiedSettings);
});

test('handlePost returns 404 when duplicate source is missing', async () => {
  const result = await handlePost({
    session: makeSession(),
    channelSlug: 'main',
    body: { name: 'Missing copy', duplicateFromSlug: 'missing' },
    deps: makeDeps(),
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: 'Source canvas not found' });
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
