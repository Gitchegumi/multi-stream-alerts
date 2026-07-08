import test from 'node:test';
import assert from 'node:assert/strict';
import { handleDelete, handlePatch, type HandlerDeps, type HandlerSession } from '../route.ts';

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
    settingsJson: object;
  }> = {},
) {
  return {
    id: overrides.id ?? 'profile-1',
    channelId: 'channel-1',
    name: overrides.name ?? 'Main',
    slug: overrides.slug ?? 'main',
    displayKey: overrides.displayKey ?? 'key-123',
    isActive: overrides.isActive ?? true,
    settingsJson: overrides.settingsJson ?? { width: 1920, height: 1080 },
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
      findFirst: (args: {
        where: { channelId: string; slug: string };
        select?: { id: true };
      }) => Promise<ReturnType<typeof makeProfileRow> | { id: string } | null>;
      update: (args: {
        where: { id: string };
        data: {
          name?: string;
          slug?: string;
          isActive?: boolean;
          settingsJson: object;
        };
      }) => Promise<ReturnType<typeof makeProfileRow>>;
      count: (args: { where: { channelId: string } }) => Promise<number>;
      delete: (args: { where: { id: string } }) => Promise<ReturnType<typeof makeProfileRow>>;
    };
  };
  canManageChannel: (userId: string, role: string, channelId: string) => Promise<boolean>;
  publishOverlaySettingsUpdate?: (update: {
    profileId: string;
    channelId: string;
    settings: Record<string, unknown>;
    updatedAt: string;
  }) => Promise<void>;
};

function makeDeps(overrides: Partial<MockDeps> = {}): HandlerDeps {
  const deps: MockDeps = {
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow(),
      },
      overlayProfile: {
        findFirst: async () => makeProfileRow(),
        update: async (args) =>
          makeProfileRow({
            name: args.data.name,
            slug: args.data.slug,
            isActive: args.data.isActive,
            settingsJson: args.data.settingsJson,
          }),
        count: async () => 2,
        delete: async () => makeProfileRow(),
      },
    },
    canManageChannel: async () => true,
    ...overrides,
  };
  return deps as unknown as HandlerDeps;
}

test('handlePatch updates canvas fields and merges settingsJson', async () => {
  let updateData: unknown = null;
  const deps = makeDeps({
    prisma: {
      channel: { findUnique: async () => makeChannelRow() },
      overlayProfile: {
        findFirst: async (args) =>
          args.where.slug === 'renamed'
            ? null
            : makeProfileRow({
                settingsJson: {
                  width: 1920,
                  height: 1080,
                  background: 'transparent',
                  alertEventKeys: ['kofi.tipped'],
                },
              }),
        update: async (args) => {
          updateData = args.data;
          return makeProfileRow({ name: args.data.name, slug: args.data.slug });
        },
        count: async () => 2,
        delete: async () => makeProfileRow(),
      },
    },
  });

  const result = await handlePatch({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    body: {
      name: 'Renamed',
      slug: 'Renamed!',
      isActive: false,
      settings: { width: 1280 },
    },
    deps,
  });

  assert.equal(result.status, 200);
  assert.deepEqual(updateData, {
    name: 'Renamed',
    slug: 'renamed',
    isActive: false,
    settingsJson: {
      width: 1280,
      height: 1080,
      background: 'transparent',
      alertEventKeys: ['kofi.tipped'],
    },
  });
});

test('handlePatch publishes updated settings for open browser sources', async () => {
  const published: Array<{
    profileId: string;
    channelId: string;
    settings: Record<string, unknown>;
    updatedAt: string;
  }> = [];
  const deps = makeDeps({
    publishOverlaySettingsUpdate: async (update) => {
      published.push(update);
    },
  });

  const result = await handlePatch({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    body: { settings: { width: 1280 } },
    deps,
  });

  assert.equal(result.status, 200);
  assert.equal(published.length, 1);
  assert.equal(published[0]?.profileId, 'profile-1');
  assert.equal(published[0]?.channelId, 'channel-1');
  assert.equal(published[0]?.settings.width, 1280);
});

test('handlePatch does not publish settings when only metadata changes', async () => {
  const published: unknown[] = [];
  const deps = makeDeps({
    publishOverlaySettingsUpdate: async (update) => {
      published.push(update);
    },
  });

  const result = await handlePatch({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    body: { name: 'Renamed only' },
    deps,
  });

  assert.equal(result.status, 200);
  assert.equal(published.length, 0);
});

test('handlePatch rejects a slug already used by another canvas', async () => {
  const result = await handlePatch({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    body: { slug: 'taken' },
    deps: makeDeps({
      prisma: {
        channel: { findUnique: async () => makeChannelRow() },
        overlayProfile: {
          findFirst: async (args) =>
            args.where.slug === 'taken' ? { id: 'other-profile' } : makeProfileRow(),
          update: async () => makeProfileRow(),
          count: async () => 2,
          delete: async () => makeProfileRow(),
        },
      },
    }),
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: 'Canvas slug already exists' });
});

test('handlePatch returns 403 when the caller cannot manage the channel', async () => {
  const result = await handlePatch({
    session: makeSession('viewer'),
    channelSlug: 'main',
    profileSlug: 'main',
    body: { name: 'Nope' },
    deps: makeDeps({ canManageChannel: async () => false }),
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: 'Channel access denied' });
});

test('handleDelete blocks deleting the last canvas', async () => {
  const result = await handleDelete({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    deps: makeDeps({
      prisma: {
        channel: { findUnique: async () => makeChannelRow() },
        overlayProfile: {
          findFirst: async () => makeProfileRow(),
          update: async () => makeProfileRow(),
          count: async () => 1,
          delete: async () => makeProfileRow(),
        },
      },
    }),
  });

  assert.equal(result.status, 409);
  assert.deepEqual(result.body, { error: 'At least one canvas is required' });
});

test('handleDelete removes a canvas when another canvas remains', async () => {
  let deletedId: string | null = null;
  const result = await handleDelete({
    session: makeSession(),
    channelSlug: 'main',
    profileSlug: 'main',
    deps: makeDeps({
      prisma: {
        channel: { findUnique: async () => makeChannelRow() },
        overlayProfile: {
          findFirst: async () => makeProfileRow({ id: 'profile-delete' }),
          update: async () => makeProfileRow(),
          count: async () => 2,
          delete: async (args) => {
            deletedId = args.where.id;
            return makeProfileRow();
          },
        },
      },
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { ok: true });
  assert.equal(deletedId, 'profile-delete');
});
