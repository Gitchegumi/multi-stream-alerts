import test from 'node:test';
import assert from 'node:assert/strict';
import {
  provisionTwitchEventSub,
  teardownTwitchEventSub,
  getTwitchAppAccessToken,
  __resetTwitchAppTokenCacheForTesting,
  SUPPORTED_TWITCH_SUBSCRIPTIONS,
  type TwitchProvisionDeps,
} from '../twitch-eventsub.ts';

const ENV = {
  TWITCH_CLIENT_ID: 'client-id',
  TWITCH_CLIENT_SECRET: 'client-secret',
  INGRESS_PUBLIC_BASE_URL: 'https://alerts.example.com',
} as unknown as NodeJS.ProcessEnv;

/** Build a fetch stub that returns queued responses by URL predicate. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

test('getTwitchAppAccessToken mints and caches a client-credentials token', async () => {
  __resetTwitchAppTokenCacheForTesting();
  let calls = 0;
  const fetchFn = (async () => {
    calls += 1;
    return jsonResponse(200, { access_token: 'app-token', expires_in: 3600 });
  }) as unknown as typeof fetch;

  const t1 = await getTwitchAppAccessToken({ env: ENV, fetchFn });
  const t2 = await getTwitchAppAccessToken({ env: ENV, fetchFn });
  assert.equal(t1, 'app-token');
  assert.equal(t2, 'app-token');
  assert.equal(calls, 1, 'second call should be served from cache');
});

test('getTwitchAppAccessToken throws when app creds are missing', async () => {
  __resetTwitchAppTokenCacheForTesting();
  await assert.rejects(
    () => getTwitchAppAccessToken({ env: {} as NodeJS.ProcessEnv }),
    /not configured/,
  );
});

test('provisionTwitchEventSub writes the secret, creates all subscriptions, and records ids', async () => {
  const created: Array<{ providerSubscriptionId: string; type: string }> = [];
  let savedSecret: string | undefined;
  let savedBroadcaster: string | undefined;
  const callbacks: string[] = [];

  let subCounter = 0;
  const deps: TwitchProvisionDeps = {
    env: ENV,
    getAppToken: async () => 'app-token',
    generateSecret: () => 'generated-secret',
    fetchFn: (async (url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      callbacks.push(body.transport.callback);
      subCounter += 1;
      return jsonResponse(202, { data: [{ id: `sub-${subCounter}` }] });
    }) as unknown as typeof fetch,
    saveCredentials: (async (input: {
      secrets: Record<string, string>;
      publicFields?: { twitchBroadcasterId?: string };
    }) => {
      savedSecret = input.secrets['twitch.eventsub_secret'];
      savedBroadcaster = input.publicFields?.twitchBroadcasterId;
      return {} as never;
    }) as unknown as TwitchProvisionDeps['saveCredentials'],
    getEventSubSecret: async () => null,
    recordSubscription: async (input) => {
      created.push({ providerSubscriptionId: input.providerSubscriptionId, type: input.type });
    },
    listSubscriptions: async () => [],
    deleteSubscriptionRecords: async () => {},
  };

  const result = await provisionTwitchEventSub(
    { channelId: 'chan-1', broadcasterUserId: '12345' },
    deps,
  );

  assert.equal(savedSecret, 'generated-secret');
  assert.equal(savedBroadcaster, '12345');
  assert.equal(result.created.length, SUPPORTED_TWITCH_SUBSCRIPTIONS.length);
  assert.equal(result.failed.length, 0);
  assert.equal(created.length, SUPPORTED_TWITCH_SUBSCRIPTIONS.length);
  assert.ok(
    callbacks.every((c) => c === 'https://alerts.example.com/api/webhooks/twitch'),
    'all subscriptions use the ingress callback',
  );
});

test('provisionTwitchEventSub records per-type failures without aborting', async () => {
  let n = 0;
  const deps: TwitchProvisionDeps = {
    env: ENV,
    getAppToken: async () => 'app-token',
    generateSecret: () => 'secret',
    fetchFn: (async () => {
      n += 1;
      // Fail the second subscription with a 403 (missing scope).
      if (n === 2) return jsonResponse(403, { error: 'forbidden' });
      return jsonResponse(202, { data: [{ id: `sub-${n}` }] });
    }) as unknown as typeof fetch,
    saveCredentials: (async () => ({}) as never) as TwitchProvisionDeps['saveCredentials'],
    getEventSubSecret: async () => null,
    recordSubscription: async () => {},
    listSubscriptions: async () => [],
    deleteSubscriptionRecords: async () => {},
  };

  const result = await provisionTwitchEventSub(
    { channelId: 'chan-1', broadcasterUserId: '12345' },
    deps,
  );

  assert.equal(result.failed.length, 1);
  assert.equal(result.failed[0]!.reason, 'http_403');
  assert.equal(result.created.length, SUPPORTED_TWITCH_SUBSCRIPTIONS.length - 1);
});

test('provisionTwitchEventSub tears down orphaned subscriptions before creating the first secret', async () => {
  const deleted: string[] = [];
  let recordsDeleted = false;
  const deps: TwitchProvisionDeps = {
    env: ENV,
    getAppToken: async () => 'app-token',
    generateSecret: () => 'secret',
    fetchFn: (async (url: string, init: RequestInit) => {
      if (init.method === 'DELETE') {
        deleted.push(url);
        return jsonResponse(204, {});
      }
      return jsonResponse(202, { data: [{ id: 'new-sub' }] });
    }) as unknown as typeof fetch,
    saveCredentials: (async () => ({}) as never) as TwitchProvisionDeps['saveCredentials'],
    getEventSubSecret: async () => null,
    recordSubscription: async () => {},
    listSubscriptions: async () => [{ providerSubscriptionId: 'old-sub-1' }],
    deleteSubscriptionRecords: async () => {
      recordsDeleted = true;
    },
  };

  await provisionTwitchEventSub({ channelId: 'chan-1', broadcasterUserId: '12345' }, deps);

  assert.ok(
    deleted.some((u) => u.includes('old-sub-1')),
    'existing subscription should be deleted remotely',
  );
  assert.ok(recordsDeleted, 'local tracking rows should be cleared before recreating');
});

test('provisionTwitchEventSub reuses the shared secret when adding another broadcaster', async () => {
  const deleted: string[] = [];
  const secrets: string[] = [];
  let credentialsWritten = false;
  const deps: TwitchProvisionDeps = {
    env: ENV,
    getAppToken: async () => 'app-token',
    getEventSubSecret: async () => 'shared-secret',
    fetchFn: (async (url: string, init: RequestInit) => {
      if (init.method === 'DELETE') deleted.push(url);
      if (init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { transport: { secret: string } };
        secrets.push(body.transport.secret);
      }
      return jsonResponse(202, { data: [{ id: `sub-${secrets.length}` }] });
    }) as unknown as typeof fetch,
    saveCredentials: (async () => {
      credentialsWritten = true;
      return {} as never;
    }) as TwitchProvisionDeps['saveCredentials'],
    recordSubscription: async () => {},
    listSubscriptions: async () => [{ providerSubscriptionId: 'existing-sub' }],
    deleteSubscriptionRecords: async () => {},
  };

  await provisionTwitchEventSub(
    { channelId: 'chan-1', broadcasterUserId: 'second-broadcaster' },
    deps,
  );

  assert.equal(deleted.length, 0, 'existing broadcaster subscriptions must be preserved');
  assert.equal(credentialsWritten, false, 'the shared secret must not be rotated');
  assert.ok(secrets.every((secret) => secret === 'shared-secret'));
});

test('teardownTwitchEventSub deletes remote subscriptions and clears credentials', async () => {
  const deleted: string[] = [];
  let cleared = false;
  const deps: TwitchProvisionDeps = {
    env: ENV,
    getAppToken: async () => 'app-token',
    fetchFn: (async (url: string) => {
      deleted.push(url);
      return jsonResponse(204, {});
    }) as unknown as typeof fetch,
    listSubscriptions: async () => [{ providerSubscriptionId: 'sub-a' }],
    deleteSubscriptionRecords: async () => {},
    clearCredentials: async () => {
      cleared = true;
    },
  };

  await teardownTwitchEventSub({ channelId: 'chan-1' }, deps);

  assert.ok(deleted.some((u) => u.includes('sub-a')));
  assert.ok(cleared, 'stored Twitch secret should be cleared on disconnect');
});
