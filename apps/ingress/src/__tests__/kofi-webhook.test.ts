import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { handleKofiWebhook, tokensMatch } from '../kofi-webhook.js';
import { parseKofiFormData } from '../kofi.js';
import type { AlertEvent } from '@multi-stream-alerts/shared';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

// The Express req/res shapes are minimal: the handler only reads
// `params`, `body`, and calls `response.status(code).json(body)`. Build
// a stub that records the last status code and the last JSON body, so
// tests can assert on both.

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

// Capture console output across the suite so tests can assert on log
// lines (and verify the verification token is never written to the
// logs). We replace console methods with spies that push into a
// shared `captured` array, then restore the originals in `afterEach`.

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

function makeParsedForm(
  overrides: Partial<{ verificationToken: string; rawEventId: string }> = {},
) {
  return {
    verificationToken: overrides.verificationToken ?? 'inbound-token-value',
    rawEventId: overrides.rawEventId ?? 'kofi-event-abc123',
    event: {
      platform: 'kofi' as const,
      type: 'tip' as const,
      displayName: 'A Supporter',
      amount: 5,
      currency: 'USD',
      message: 'Thanks!',
      isPublic: true,
      rawEventId: overrides.rawEventId ?? 'kofi-event-abc123',
      rawPayload: {},
    },
  } as unknown as ReturnType<typeof parseKofiFormData>;
}

function makeEvent(channelId: string): AlertEvent {
  return {
    id: 'alert-id-1',
    channelId,
    platform: 'kofi',
    type: 'tip',
    displayName: 'A Supporter',
    amount: 5,
    currency: 'USD',
    message: 'Thanks!',
    isPublic: true,
    rawEventId: 'kofi-event-abc123',
    rawPayload: {},
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// tokensMatch (pure helper)
// ---------------------------------------------------------------------------

test('tokensMatch returns true for identical strings', () => {
  assert.equal(tokensMatch('a-secret-token', 'a-secret-token'), true);
});

test('tokensMatch returns false for different strings of the same length', () => {
  assert.equal(tokensMatch('aaaaaaaa', 'bbbbbbbb'), false);
});

test('tokensMatch returns false for strings of different lengths (does not throw)', () => {
  // timingSafeEqual throws on length mismatch — the helper must short
  // circuit on length first.
  assert.equal(tokensMatch('short', 'a-much-longer-token-string'), false);
  assert.equal(tokensMatch('a-much-longer-token-string', 'short'), false);
});

// ---------------------------------------------------------------------------
// 1. Channel not found -> 404
// ---------------------------------------------------------------------------

test("returns 404 when the channel slug doesn't resolve", async () => {
  const findChannel = mock.fn(async (_slug: string) => null);
  const getToken = mock.fn(async (_channelId: string) => 'stored-token');
  const parseForm = mock.fn((_body: unknown) => makeParsedForm());
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'missing-channel' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 404);
  assert.deepEqual(res.lastBody, { error: 'Channel not found' });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(findChannel.mock.calls[0]?.arguments[0], 'missing-channel');
  // No further work should happen if the channel is missing.
  assert.equal(getToken.mock.callCount(), 0);
  assert.equal(parseForm.mock.callCount(), 0);
  assert.equal(claimDedup.mock.callCount(), 0);
  assert.equal(storeAndPublish.mock.callCount(), 0);

  // Audit log line present with the channel slug and the rejection reason.
  const warn = captured.find((c) => c.method === 'warn');
  assert.ok(warn, 'expected a console.warn call');
  assert.deepEqual(warn!.args, [
    'kofi webhook rejected',
    { channelSlug: 'missing-channel', reason: 'channel_not_found' },
  ]);
});

// ---------------------------------------------------------------------------
// 2. Channel exists but no token stored -> 503
// ---------------------------------------------------------------------------

test('returns 503 when the channel exists but no Ko-fi token is stored', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => null);
  const parseForm = mock.fn((_body: unknown) => makeParsedForm());
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: 'Ko-fi not configured for this channel' });
  assert.equal(getToken.mock.callCount(), 1);
  assert.equal(getToken.mock.calls[0]?.arguments[0], 'channel-1');
  assert.equal(parseForm.mock.callCount(), 0);
  assert.equal(claimDedup.mock.callCount(), 0);

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'kofi webhook rejected',
    { channelSlug: 'alpha', reason: 'not_configured' },
  ]);
});

// ---------------------------------------------------------------------------
// 3. Token mismatch -> 401
// ---------------------------------------------------------------------------

test('returns 401 when the inbound token does not match the stored token', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => 'stored-secret-AAAA');
  const parseForm = mock.fn((_body: unknown) =>
    makeParsedForm({ verificationToken: 'inbound-token-BBBB' }),
  );
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 401);
  assert.deepEqual(res.lastBody, { error: 'Invalid verification token' });
  assert.equal(claimDedup.mock.callCount(), 0);
  assert.equal(storeAndPublish.mock.callCount(), 0);

  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'kofi webhook rejected',
    { channelSlug: 'alpha', reason: 'invalid_token' },
  ]);
});

// ---------------------------------------------------------------------------
// 4. Valid first-time event -> 200, storeAndPublish called
// ---------------------------------------------------------------------------

test('returns 200 on a valid first-time event and stores the event', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => 'stored-secret-token');
  const parseForm = mock.fn((_body: unknown) =>
    makeParsedForm({ verificationToken: 'stored-secret-token', rawEventId: 'kofi-event-fresh' }),
  );
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 200);
  const body = res.lastBody as { ok: boolean; duplicate: boolean; event: AlertEvent };
  assert.equal(body.ok, true);
  assert.equal(body.duplicate, false);
  assert.equal(body.event.channelId, 'channel-1');

  // claimDedup was called once; its argument was the dedup tuple.
  assert.equal(claimDedup.mock.callCount(), 1);
  const claimCall = claimDedup.mock.calls[0];
  assert.ok(claimCall, 'claimDedup should have been called');
  assert.deepEqual((claimCall.arguments as unknown as [unknown])[0], {
    provider: 'kofi',
    rawEventId: 'kofi-event-fresh',
    channelId: 'channel-1',
  });

  // storeAndPublish was called once with channelId and the event payload.
  assert.equal(storeAndPublish.mock.callCount(), 1);
  const publishCall = storeAndPublish.mock.calls[0];
  assert.ok(publishCall, 'storeAndPublish should have been called');
  const publishInput = (
    publishCall.arguments as unknown as [{ channelId: string; rawEventId: string }]
  )[0];
  assert.equal(publishInput.channelId, 'channel-1');
  assert.equal(publishInput.rawEventId, 'kofi-event-fresh');

  const info = captured.find((c) => c.method === 'info');
  assert.deepEqual(info!.args, [
    'kofi webhook accepted',
    { channelSlug: 'alpha', rawEventId: 'kofi-event-fresh' },
  ]);
});

// ---------------------------------------------------------------------------
// 5. Duplicate rawEventId -> 200, duplicate: true, no storeAndPublish
// ---------------------------------------------------------------------------

test('returns 200 with { ok: true, duplicate: true } on a duplicate rawEventId', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => 'stored-secret-token');
  const parseForm = mock.fn((_body: unknown) =>
    makeParsedForm({
      verificationToken: 'stored-secret-token',
      rawEventId: 'kofi-event-already-seen',
    }),
  );
  const claimDedup = mock.fn(async () => false); // simulate collision
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 200);
  assert.deepEqual(res.lastBody, { ok: true, duplicate: true });
  assert.equal(storeAndPublish.mock.callCount(), 0);

  // Rejection log line uses the "duplicate" reason.
  const warn = captured.find((c) => c.method === 'warn');
  assert.deepEqual(warn!.args, [
    'kofi webhook rejected',
    { channelSlug: 'alpha', reason: 'duplicate' },
  ]);
});

// ---------------------------------------------------------------------------
// 6. Malformed payload -> 400 (parseKofiFormData throws)
// ---------------------------------------------------------------------------

test('returns 400 on a malformed Ko-fi payload (parseKofiFormData throws)', async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => 'stored-secret-token');
  const parseForm = mock.fn((_body: unknown) => {
    throw new Error('Missing Ko-fi data field');
  });
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { not_data: 'garbage' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  assert.equal(res.lastStatus, 400);
  assert.deepEqual(res.lastBody, { error: 'Malformed Ko-fi payload' });
  assert.equal(claimDedup.mock.callCount(), 0);
  assert.equal(storeAndPublish.mock.callCount(), 0);
});

// ---------------------------------------------------------------------------
// 7. Log lines never include the token value
// ---------------------------------------------------------------------------

test("the 'invalid token' log line never includes the expected or provided token", async () => {
  const expected = 'stored-secret-token-XYZ';
  const provided = 'inbound-attacker-token-123';

  const findChannel = mock.fn(async (_slug: string) => ({ id: 'channel-1', slug: 'alpha' }));
  const getToken = mock.fn(async (_channelId: string) => expected);
  const parseForm = mock.fn((_body: unknown) => makeParsedForm({ verificationToken: provided }));
  const claimDedup = mock.fn(async () => true);
  const storeAndPublish = mock.fn(async () => makeEvent('channel-1'));

  const req = { params: { channelSlug: 'alpha' }, body: { data: '{}' } };
  const res = makeStubResponse();
  await handleKofiWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedToken: getToken,
    parseForm: parseForm,
    claimDedup: claimDedup,
    storeAndPublish: storeAndPublish,
  });

  // The handler emitted exactly one warn (the rejection). The token
  // value must not appear in that log line OR any other line emitted
  // during the request.
  for (const entry of captured) {
    const serialised = entry.args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    assert.ok(
      !serialised.includes(expected),
      `log line via console.${entry.method} contained the expected token: ${serialised}`,
    );
    assert.ok(
      !serialised.includes(provided),
      `log line via console.${entry.method} contained the provided token: ${serialised}`,
    );
  }
});
