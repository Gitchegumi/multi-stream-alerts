import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveYoutubeChannel,
  resolveYoutubeChannelId,
  provisionYoutubeWebSub,
  teardownYoutubeWebSub,
  type YoutubeProvisionDeps,
} from '../youtube-websub.ts';

const ENV = {
  INGRESS_PUBLIC_BASE_URL: 'https://alerts.example.com',
} as unknown as NodeJS.ProcessEnv;

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('resolveYoutubeChannelId returns the first channel id from the Data API', async () => {
  const fetchFn = (async () =>
    jsonResponse(200, { items: [{ id: 'UC_channel_123' }] })) as unknown as typeof fetch;
  const id = await resolveYoutubeChannelId('access-token', { fetchFn });
  assert.equal(id, 'UC_channel_123');
});

test('resolveYoutubeChannel returns the channel title used in account settings', async () => {
  const fetchFn = (async () =>
    jsonResponse(200, {
      items: [{ id: 'UC_channel_123', snippet: { title: 'GitcheGumi Gaming' } }],
    })) as unknown as typeof fetch;

  assert.deepEqual(await resolveYoutubeChannel('access-token', { fetchFn }), {
    id: 'UC_channel_123',
    title: 'GitcheGumi Gaming',
  });
});

test('resolveYoutubeChannelId returns null on error or empty result', async () => {
  const empty = (async () => jsonResponse(200, { items: [] })) as unknown as typeof fetch;
  assert.equal(await resolveYoutubeChannelId('t', { fetchFn: empty }), null);

  const fail = (async () => jsonResponse(401, {})) as unknown as typeof fetch;
  assert.equal(await resolveYoutubeChannelId('t', { fetchFn: fail }), null);
});

test('provisionYoutubeWebSub subscribes with the ingress callback and records lease expiry', async () => {
  let sentBody: URLSearchParams | undefined;
  let savedSecret: string | undefined;
  let savedChannelId: string | undefined;
  let recorded: { topic: string; expiresAt: Date } | undefined;

  const deps: YoutubeProvisionDeps = {
    env: ENV,
    generateSecret: () => 'websub-secret',
    now: () => 1_000_000,
    leaseSeconds: 100,
    fetchFn: (async (_url: string, init: RequestInit) => {
      sentBody = init.body as URLSearchParams;
      return jsonResponse(202, {});
    }) as unknown as typeof fetch,
    saveCredentials: (async (input: {
      secrets: Record<string, string>;
      publicFields?: { youtubeChannelId?: string };
    }) => {
      savedSecret = input.secrets['youtube.websub_secret'];
      savedChannelId = input.publicFields?.youtubeChannelId;
      return {} as never;
    }) as unknown as YoutubeProvisionDeps['saveCredentials'],
    recordSubscription: async (input) => {
      recorded = { topic: input.topic, expiresAt: input.expiresAt };
    },
  };

  const result = await provisionYoutubeWebSub(
    { channelId: 'chan-1', channelSlug: 'my-channel', youtubeChannelId: 'UC_abc' },
    deps,
  );

  assert.equal(result.ok, true);
  assert.equal(savedSecret, 'websub-secret');
  assert.equal(savedChannelId, 'UC_abc');
  assert.equal(sentBody?.get('hub.mode'), 'subscribe');
  assert.equal(
    sentBody?.get('hub.callback'),
    'https://alerts.example.com/api/webhooks/youtube/my-channel',
  );
  assert.ok(sentBody?.get('hub.topic')?.includes('UC_abc'));
  assert.equal(sentBody?.get('hub.secret'), 'websub-secret');
  // now (1_000_000ms) + lease (100s = 100_000ms)
  assert.equal(recorded?.expiresAt.getTime(), 1_100_000);
});

test('provisionYoutubeWebSub reports failure on a non-2xx hub response', async () => {
  const deps: YoutubeProvisionDeps = {
    env: ENV,
    generateSecret: () => 's',
    fetchFn: (async () => jsonResponse(400, {})) as unknown as typeof fetch,
    saveCredentials: (async () => ({}) as never) as YoutubeProvisionDeps['saveCredentials'],
    recordSubscription: async () => {},
  };
  const result = await provisionYoutubeWebSub(
    { channelId: 'chan-1', channelSlug: 'slug', youtubeChannelId: 'UC_abc' },
    deps,
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'http_400');
});

test('teardownYoutubeWebSub unsubscribes tracked topics and clears credentials', async () => {
  const modes: string[] = [];
  let cleared = false;
  let recordsDeleted = false;

  const deps: YoutubeProvisionDeps = {
    env: ENV,
    fetchFn: (async (_url: string, init: RequestInit) => {
      const body = init.body as URLSearchParams;
      modes.push(body.get('hub.mode') ?? '');
      return jsonResponse(202, {});
    }) as unknown as typeof fetch,
    listSubscriptions: async () => [{ providerSubscriptionId: 'topic-1' }],
    deleteSubscriptionRecords: async () => {
      recordsDeleted = true;
    },
    clearCredentials: async () => {
      cleared = true;
    },
  };

  await teardownYoutubeWebSub({ channelId: 'chan-1', channelSlug: 'slug' }, deps);

  assert.deepEqual(modes, ['unsubscribe']);
  assert.ok(recordsDeleted);
  assert.ok(cleared);
});
