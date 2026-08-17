import test from 'node:test';
import assert from 'node:assert/strict';
import { handleGet, type HandlerDeps } from '../../app/api/assets/[assetId]/content/route.ts';

function makeAsset(
  overrides: Partial<{
    id: string;
    channelId: string;
    externalUrl: string | null;
    storageKey: string | null;
    mimeType: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 'asset-1',
    channelId: overrides.channelId ?? 'channel-1',
    ownerUserId: null,
    sourceType: overrides.externalUrl ? 'external_url' : 'local',
    assetType: 'image',
    originalFilename: null,
    storedFilename: null,
    storageKey: overrides.storageKey ?? null,
    externalUrl: overrides.externalUrl ?? null,
    mimeType: overrides.mimeType ?? 'image/png',
    fileSizeBytes: null,
    durationSeconds: null,
    storageProvider: overrides.externalUrl ? 'external_url' : 'local',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeDeps(
  overrides: Partial<{
    asset: ReturnType<typeof makeAsset> | null;
    profile: { channelId: string; isActive: boolean } | null;
    session: { user: { id: string; role: 'admin' | 'owner' | 'editor' | 'viewer' } } | null;
    canView: boolean;
    storageBody: Buffer;
  }> = {},
): HandlerDeps {
  const deps = {
    prisma: {
      workspaceAsset: {
        findUnique: async () => overrides.asset ?? makeAsset(),
      },
      overlayProfile: {
        findUnique: async () => overrides.profile ?? null,
      },
    },
    canViewChannel: async () => overrides.canView ?? false,
    getSession: async () => overrides.session ?? null,
    storage: {
      put: async () => {
        throw new Error('not used');
      },
      get: async () => overrides.storageBody ?? Buffer.from('asset-bytes'),
      delete: async () => undefined,
    },
  };
  return deps as unknown as HandlerDeps;
}

test('external URL assets require authorization before redirecting', async () => {
  const result = await handleGet({
    request: new Request('https://alerts.example/api/assets/asset-1/content'),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ externalUrl: 'https://cdn.example.com/private.png' }),
      session: null,
      canView: false,
    }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.redirectUrl, undefined);
  assert.equal(result.body, 'Asset access denied');
});

test('external URL assets redirect after matching display key authorization', async () => {
  const result = await handleGet({
    request: new Request(
      'https://alerts.example/api/assets/asset-1/content?displayKey=display-key-1',
    ),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ channelId: 'channel-1', externalUrl: 'https://cdn.example.com/a.png' }),
      profile: { channelId: 'channel-1', isActive: true },
    }),
  });

  assert.equal(result.status, 307);
  assert.equal(result.redirectUrl, 'https://cdn.example.com/a.png');
});

test('display keys cannot read assets from another channel', async () => {
  const result = await handleGet({
    request: new Request(
      'https://alerts.example/api/assets/asset-1/content?displayKey=display-key-1',
    ),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ channelId: 'channel-1', externalUrl: 'https://cdn.example.com/a.png' }),
      profile: { channelId: 'channel-2', isActive: true },
    }),
  });

  assert.equal(result.status, 403);
  assert.equal(result.redirectUrl, undefined);
});

test('session authorization can read local asset bytes', async () => {
  const result = await handleGet({
    request: new Request('https://alerts.example/api/assets/asset-1/content'),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ storageKey: 'channel-1/file.png' }),
      session: { user: { id: 'user-1', role: 'owner' } },
      canView: true,
      storageBody: Buffer.from('png'),
    }),
  });

  assert.equal(result.status, 200);
  assert.deepEqual(
    Buffer.from((result.body as ArrayBuffer) ?? new ArrayBuffer(0)),
    Buffer.from('png'),
  );
  assert.equal((result.headers as Record<string, string>)['content-type'], 'image/png');
  assert.equal((result.headers as Record<string, string>)['accept-ranges'], 'bytes');
});

test('local media assets support byte range requests', async () => {
  const result = await handleGet({
    request: new Request('https://alerts.example/api/assets/asset-1/content', {
      headers: { range: 'bytes=2-5' },
    }),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ storageKey: 'channel-1/clip.webm', mimeType: 'video/webm' }),
      session: { user: { id: 'user-1', role: 'owner' } },
      canView: true,
      storageBody: Buffer.from('0123456789'),
    }),
  });

  assert.equal(result.status, 206);
  assert.equal(Buffer.from(result.body as ArrayBuffer).toString(), '2345');
  assert.equal((result.headers as Record<string, string>)['content-range'], 'bytes 2-5/10');
  assert.equal((result.headers as Record<string, string>)['content-length'], '4');
});

test('unsatisfiable byte ranges return 416', async () => {
  const result = await handleGet({
    request: new Request('https://alerts.example/api/assets/asset-1/content', {
      headers: { range: 'bytes=20-30' },
    }),
    assetId: 'asset-1',
    deps: makeDeps({
      asset: makeAsset({ storageKey: 'channel-1/clip.webm', mimeType: 'video/webm' }),
      session: { user: { id: 'user-1', role: 'owner' } },
      canView: true,
      storageBody: Buffer.from('0123456789'),
    }),
  });

  assert.equal(result.status, 416);
  assert.equal((result.headers as Record<string, string>)['content-range'], 'bytes */10');
});
