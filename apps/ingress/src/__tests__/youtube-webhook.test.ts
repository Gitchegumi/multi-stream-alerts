import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleYoutubeWebhook, handleYoutubeWebSubVerification } from '../youtube-webhook.js';
import type { AlertEvent } from '@multi-stream-alerts/shared';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface StubResponse {
  status: (code: number) => { json: (body: unknown) => void; send: (body: string) => void };
  lastStatus: number;
  lastBody: unknown;
}

function makeStubResponse(): StubResponse {
  const stub: StubResponse = {
    status: (_code: number) => ({ json: (_body: unknown) => undefined, send: () => undefined }),
    lastStatus: 0,
    lastBody: undefined,
  };
  stub.status = (code: number) => {
    stub.lastStatus = code;
    return {
      json: (body: unknown) => {
        stub.lastBody = body;
      },
      send: (body: string) => {
        stub.lastBody = body;
      },
    };
  };
  return stub;
}

type CapturedLog = { method: 'log' | 'info' | 'warn' | 'error'; args: unknown[] };

const captured: CapturedLog[] = [];
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

test.beforeEach(() => {
  captured.length = 0;
  console.log = (...args: unknown[]) => captured.push({ method: 'log', args });
  console.info = (...args: unknown[]) => captured.push({ method: 'info', args });
  console.warn = (...args: unknown[]) => captured.push({ method: 'warn', args });
  console.error = (...args: unknown[]) => captured.push({ method: 'error', args });
});

test.afterEach(() => {
  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
});

function makeAtomXml(
  overrides: Partial<{ videoId: string; channelId: string; title: string; author: string }> = {},
) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<fedd xmlns:yt="http://www.youtube.com/xml/schemas/2015">
  <entry>
    <id>yt:video:${overrides.videoId ?? 'abc123'}</id>
    <yt:channelId>${overrides.channelId ?? 'UCchannel123'}</yt:channelId>
    <title>${overrides.title ?? 'Stream Title'}</title>
    <author><name>${overrides.author ?? 'ChannelName'}</name></author>
  </entry>
</fedd>`;
}

function makeEvent(channelId: string): AlertEvent {
  return {
    id: 'alert-id-1',
    channelId,
    platform: 'youtube',
    type: 'stream_online',
    eventKey: 'youtube.stream_online',
    displayName: 'ChannelName',
    rawEventId: 'abc123',
    rawPayload: {},
    createdAt: '2026-06-02T12:00:00Z',
  } as AlertEvent;
}

const SIGNED_HEADERS = { 'x-hub-signature': 'sha1=deadbeef' };

// ---------------------------------------------------------------------------
// 1. Channel not found -> 404
// ---------------------------------------------------------------------------

test("returns 404 when the channel slug doesn't resolve", async () => {
  const findChannel = mock.fn(async (_slug: string) => null);
  const getSecret = mock.fn(async (_channelId: string) => 'websub-secret');

  const req = { params: { channelSlug: 'missing-channel' }, body: {}, headers: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getWebSubSecret: getSecret,
  });

  assert.equal(res.lastStatus, 404);
  assert.deepEqual(res.lastBody, { error: 'Channel not found' });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(getSecret.mock.callCount(), 0);

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'missing-channel', reason: 'channel_not_found' },
  ]);
});

// ---------------------------------------------------------------------------
// 2. Channel exists but not provisioned (no WebSub secret) -> 503
// ---------------------------------------------------------------------------

test('returns 503 when the channel has not been YouTube-provisioned', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getSecret = mock.fn(async (_channelId: string) => null);

  const req = { params: { channelSlug: 'alpha' }, body: {}, headers: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getWebSubSecret: getSecret,
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: 'YouTube not configured for this channel' });
  assert.equal(getSecret.mock.callCount(), 1);
  assert.equal(getSecret.mock.calls[0]?.arguments[0], 'channel-1');

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'alpha', reason: 'not_configured' },
  ]);
});

// ---------------------------------------------------------------------------
// 2b. Invalid WebSub signature -> 401
// ---------------------------------------------------------------------------

test('returns 401 when the WebSub HMAC does not verify', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getSecret = mock.fn(async (_channelId: string) => 'websub-secret');
  const verify = mock.fn(() => false);

  const req = {
    params: { channelSlug: 'alpha' },
    body: Buffer.from(makeAtomXml()),
    headers: { 'x-hub-signature': 'sha1=bogus' },
  };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getWebSubSecret: getSecret,
    verifySignature: verify,
  });

  assert.equal(res.lastStatus, 401);
  assert.deepEqual(res.lastBody, { error: 'Invalid WebSub signature' });
  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'alpha', reason: 'invalid_signature' },
  ]);
});

// ---------------------------------------------------------------------------
// 3. Valid stream_online event -> 200 + event
// ---------------------------------------------------------------------------

test('returns 200 + event on a valid, signed stream_online notification', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getSecret = mock.fn(async (_channelId: string) => 'websub-secret');
  const verify = mock.fn(() => true);

  const xml = makeAtomXml({ videoId: 'vid-123', author: 'TestAuthor' });
  const fakeEvent = makeEvent('channel-1');

  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml), headers: SIGNED_HEADERS };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getWebSubSecret: getSecret,
    verifySignature: verify,
    claimDedup: mock.fn(async () => true),
    storeAndPublish: mock.fn(async () => fakeEvent),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, event: fakeEvent });
  assert.equal(verify.mock.callCount(), 1);

  const info = captured.find((c) => c.method === 'info');
  assert.equal(info!.args[0], 'youtube webhook accepted');
});

// ---------------------------------------------------------------------------
// 4. Unmapped/malformed XML -> 204
// ---------------------------------------------------------------------------

test('returns 204 for malformed or unmapped XML', async () => {
  const req = {
    params: { channelSlug: 'alpha' },
    body: Buffer.from('<not-an-entry></not-an-entry>'),
    headers: SIGNED_HEADERS,
  };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1', slug: 'alpha' }),
    getWebSubSecret: async () => 'websub-secret',
    verifySignature: () => true,
  });

  assert.equal(res.lastStatus, 204);
  assert.deepEqual(res.lastBody, {});

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook suppressed',
    { channelSlug: 'alpha', reason: 'unmapped' },
  ]);
});

// ---------------------------------------------------------------------------
// 5. Duplicate -> 200 + duplicate flag
// ---------------------------------------------------------------------------

test('returns 200 + duplicate flag for duplicate events', async () => {
  const xml = makeAtomXml({ videoId: 'dup-123', author: 'DupAuthor' });
  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml), headers: SIGNED_HEADERS };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1', slug: 'alpha' }),
    getWebSubSecret: async () => 'websub-secret',
    verifySignature: () => true,
    claimDedup: mock.fn(async () => false),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, duplicate: true });
});

// ---------------------------------------------------------------------------
// 6. Log lines never include the WebSub secret value
// ---------------------------------------------------------------------------

test('log lines never include the WebSub secret', async () => {
  const expectedSecret = 'stored-websub-secret-BBB-222';

  const req = {
    params: { channelSlug: 'alpha' },
    body: Buffer.from(makeAtomXml()),
    headers: SIGNED_HEADERS,
  };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1', slug: 'alpha' }),
    getWebSubSecret: async () => expectedSecret,
    verifySignature: () => true,
    claimDedup: mock.fn(async () => true),
    storeAndPublish: mock.fn(async () => makeEvent('channel-1')),
  });

  for (const entry of captured) {
    const serialised = entry.args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    assert.ok(
      !serialised.includes(expectedSecret),
      `log line via console.${entry.method} contained the secret: ${serialised}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 7. Suppressed alert -> 200 + suppressed flag
// ---------------------------------------------------------------------------

test('returns 200 + suppressed flag when alert type is disabled', async () => {
  const xml = makeAtomXml({ videoId: 'sup-123', author: 'SupAuthor' });
  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml), headers: SIGNED_HEADERS };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1', slug: 'alpha' }),
    getWebSubSecret: async () => 'websub-secret',
    verifySignature: () => true,
    claimDedup: mock.fn(async () => true),
    storeAndPublish: mock.fn(async () => null),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, suppressed: true });
});

// ---------------------------------------------------------------------------
// 8. WebSub verification (GET): echoes hub.challenge for a known topic
// ---------------------------------------------------------------------------

test('WebSub verification echoes hub.challenge for a known subscription', async () => {
  const req = {
    params: { channelSlug: 'alpha' },
    query: {
      'hub.mode': 'subscribe',
      'hub.topic': 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC_abc',
      'hub.challenge': 'challenge-token-123',
    },
  };
  const res = makeStubResponse();

  await handleYoutubeWebSubVerification(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1' }),
    hasSubscription: async () => true,
  });

  assert.equal(res.lastStatus, 200);
  assert.equal(res.lastBody, 'challenge-token-123');
});

test('WebSub verification rejects an unknown topic with 404', async () => {
  const req = {
    params: { channelSlug: 'alpha' },
    query: {
      'hub.mode': 'subscribe',
      'hub.topic': 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=UC_other',
      'hub.challenge': 'challenge-token-123',
    },
  };
  const res = makeStubResponse();

  await handleYoutubeWebSubVerification(req, res, {
    findChannelBySlug: async () => ({ id: 'channel-1' }),
    hasSubscription: async () => false,
  });

  assert.equal(res.lastStatus, 404);
  assert.equal(res.lastBody, 'Unknown subscription');
});
