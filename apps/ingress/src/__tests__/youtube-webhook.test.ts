import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleYoutubeWebhook } from '../youtube-webhook.js';
import type { AlertEvent } from '@multi-stream-alerts/shared';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface StubResponse {
  status: (code: number) => { json: (body: unknown) => void };
  lastStatus: number;
  lastBody: unknown;
}

function makeStubResponse(): StubResponse {
  const stub: StubResponse = {
    status: (_code: number) => ({ json: (_body: unknown) => undefined }),
    lastStatus: 0,
    lastBody: undefined,
  };
  stub.status = (code: number) => {
    stub.lastStatus = code;
    return {
      json: (body: unknown) => {
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

// ---------------------------------------------------------------------------
// 1. Channel not found -> 404
// ---------------------------------------------------------------------------

test("returns 404 when the channel slug doesn't resolve", async () => {
  const findChannel = mock.fn(async (_slug: string) => null);
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => 'stored-client-secret');

  const req = { params: { channelSlug: 'missing-channel' }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
  });

  assert.equal(res.lastStatus, 404);
  assert.deepEqual(res.lastBody, { error: 'Channel not found' });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(findChannel.mock.calls[0]?.arguments[0], 'missing-channel');
  assert.equal(getClientId.mock.callCount(), 0);
  assert.equal(getClientSecret.mock.callCount(), 0);

  const warn = captured.find((c) => c.method === 'warn');
  assert.ok(warn, 'expected a console.warn call');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'missing-channel', reason: 'channel_not_found' },
  ]);
});

// ---------------------------------------------------------------------------
// 2. Channel exists but no YouTube credentials stored -> 503
// ---------------------------------------------------------------------------

test('returns 503 when the channel exists but YouTube credentials are not stored', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => null);
  const getClientSecret = mock.fn(async (_channelId: string) => null);

  const req = { params: { channelSlug: 'alpha' }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: 'YouTube not configured for this channel' });
  assert.equal(getClientId.mock.callCount(), 1);
  assert.equal(getClientSecret.mock.callCount(), 1);
  assert.equal(getClientId.mock.calls[0]?.arguments[0], 'channel-1');
  assert.equal(getClientSecret.mock.calls[0]?.arguments[0], 'channel-1');

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'alpha', reason: 'not_configured' },
  ]);
});

// ---------------------------------------------------------------------------
// 2b. Partially configured (client_id present, secret missing) -> 503
// ---------------------------------------------------------------------------

test('returns 503 when only one of the YouTube credentials is stored', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => null);

  const req = { params: { channelSlug: 'alpha' }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: 'YouTube not configured for this channel' });

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'youtube webhook rejected',
    { channelSlug: 'alpha', reason: 'not_configured' },
  ]);
});

// ---------------------------------------------------------------------------
// 3. Valid stream_online event -> 200 + event
// ---------------------------------------------------------------------------

test('returns 200 + event on a valid stream_online PubSub payload', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => 'stored-client-secret');

  const xml = makeAtomXml({ videoId: 'vid-123', author: 'TestAuthor' });
  const fakeEvent = makeEvent('channel-1');

  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml) };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
    claimDedup: mock.fn(async () => true),
    storeAndPublish: mock.fn(async () => fakeEvent),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, event: fakeEvent });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(getClientId.mock.callCount(), 1);
  assert.equal(getClientSecret.mock.callCount(), 1);

  const info = captured.find((c) => c.method === 'info');
  assert.ok(info, 'expected a console.info call');
  assert.equal(info!.args[0], 'youtube webhook accepted');
  const logPayload = info!.args[1] as { channelSlug: string; channelId: string };
  assert.equal(logPayload.channelSlug, 'alpha');
  assert.equal(logPayload.channelId, 'channel-1');
});

// ---------------------------------------------------------------------------
// 4. Unmapped/malformed XML -> 204
// ---------------------------------------------------------------------------

test('returns 204 for malformed or unmapped XML', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => 'stored-client-secret');

  const req = {
    params: { channelSlug: 'alpha' },
    body: Buffer.from('<not-an-entry></not-an-entry>'),
  };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
  });

  assert.equal(res.lastStatus, 204);
  assert.deepEqual(res.lastBody, {});

  const warn = captured.find((c) => c.method === 'warn');
  assert.ok(warn, 'expected a console.warn call');
  assert.deepEqual(warn!.args, [
    'youtube webhook suppressed',
    { channelSlug: 'alpha', reason: 'unmapped' },
  ]);
});

// ---------------------------------------------------------------------------
// 5. Duplicate -> 200 + duplicate flag
// ---------------------------------------------------------------------------

test('returns 200 + duplicate flag for duplicate events', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => 'stored-client-secret');

  const xml = makeAtomXml({ videoId: 'dup-123', author: 'DupAuthor' });

  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml) };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
    claimDedup: mock.fn(async () => false),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, duplicate: true });
});

// ---------------------------------------------------------------------------
// 6. Log lines never include the client_id or client_secret value
// ---------------------------------------------------------------------------

test('log lines never include the client id or secret', async () => {
  const expectedClientId = 'stored-client-id-AAA-111';
  const expectedClientSecret = 'stored-client-secret-BBB-222';

  const findChannel = mock.fn(async (_slug: string) => null);
  const getClientId = mock.fn(async (_channelId: string) => expectedClientId);
  const getClientSecret = mock.fn(async (_channelId: string) => expectedClientSecret);

  const req = { params: { channelSlug: 'alpha' }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
  });

  for (const entry of captured) {
    const serialised = entry.args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    assert.ok(
      !serialised.includes(expectedClientId),
      `log line via console.${entry.method} contained the client id: ${serialised}`,
    );
    assert.ok(
      !serialised.includes(expectedClientSecret),
      `log line via console.${entry.method} contained the client secret: ${serialised}`,
    );
  }
});

// ---------------------------------------------------------------------------
// 7. Suppressed alert -> 200 + suppressed flag
// ---------------------------------------------------------------------------

test('returns 200 + suppressed flag when alert type is disabled', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getClientId = mock.fn(async (_channelId: string) => 'stored-client-id');
  const getClientSecret = mock.fn(async (_channelId: string) => 'stored-client-secret');

  const xml = makeAtomXml({ videoId: 'sup-123', author: 'SupAuthor' });

  const req = { params: { channelSlug: 'alpha' }, body: Buffer.from(xml) };
  const res = makeStubResponse();

  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret,
    claimDedup: mock.fn(async () => true),
    storeAndPublish: mock.fn(async () => null),
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, suppressed: true });
});
