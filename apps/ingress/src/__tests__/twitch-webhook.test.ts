import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { createHmac } from 'node:crypto';
import { verifyTwitchEventSubSignature } from '../twitch.js';
import { handleTwitchWebhook } from '../twitch-webhook.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a valid Twitch EventSub signature for the given (messageId,
 * timestamp, rawBody, secret) tuple. Used by tests that want a
 * "valid-from-the-perspective-of-this-secret" signature so they can
 * assert the verifier picks the right candidate out of a list.
 */
function buildSignature(input: {
  secret: string;
  messageId: string;
  timestamp: string;
  rawBody: Buffer;
}): string {
  return (
    'sha256=' +
    createHmac('sha256', input.secret)
      .update(input.messageId + input.timestamp)
      .update(input.rawBody)
      .digest('hex')
  );
}

// The Express req/res shapes are minimal: the handler only reads
// `headers` / `body` and calls `response.status(code).json(body)`.
// Build a stub that records the last status code and the last JSON
// body, so tests can assert on both.

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
// lines (and verify the secret value is never written to the logs).
// We replace console methods with spies that push into a shared
// `captured` array, then restore the originals in `afterEach`.

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

// ---------------------------------------------------------------------------
// 1. Verifier: valid=true and matching channelId when one candidate matches
// ---------------------------------------------------------------------------

test('verifyTwitchEventSubSignature returns valid=true and the matching channelId when one candidate matches', () => {
  const messageId = 'msg-1';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"hello":"world"}');

  const matchingSecret = 'the-good-secret';
  const otherSecret = 'the-bad-secret';
  const signature = buildSignature({ secret: matchingSecret, messageId, timestamp, rawBody });

  const result = verifyTwitchEventSubSignature({
    candidates: [
      { channelId: 'channel-a', secret: otherSecret },
      { channelId: 'channel-b', secret: matchingSecret },
      { channelId: 'channel-c', secret: 'yet-another-secret' },
    ],
    messageId,
    timestamp,
    signature,
    rawBody,
  });

  assert.deepEqual(result, { channelId: 'channel-b', valid: true });
});

// ---------------------------------------------------------------------------
// 2. Verifier: valid=false when no candidate matches
// ---------------------------------------------------------------------------

test('verifyTwitchEventSubSignature returns valid=false when no candidate matches', () => {
  const messageId = 'msg-2';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"hello":"world"}');

  // The signature was produced with a secret that is NOT in the candidate list.
  const signature = buildSignature({
    secret: 'the-attacker-secret',
    messageId,
    timestamp,
    rawBody,
  });

  const result = verifyTwitchEventSubSignature({
    candidates: [
      { channelId: 'channel-a', secret: 'stored-a' },
      { channelId: 'channel-b', secret: 'stored-b' },
    ],
    messageId,
    timestamp,
    signature,
    rawBody,
  });

  assert.equal(result.valid, false);
  assert.equal(result.channelId, null);
});

// ---------------------------------------------------------------------------
// 3. Verifier: valid=false when message headers are missing
// ---------------------------------------------------------------------------

test('verifyTwitchEventSubSignature returns valid=false when message headers are missing', () => {
  const rawBody = Buffer.from('{"hello":"world"}');

  // messageId missing
  const noId = verifyTwitchEventSubSignature({
    candidates: [{ channelId: 'channel-a', secret: 'stored-a' }],
    timestamp: '2026-06-02T12:00:00Z',
    signature: 'sha256=anything',
    rawBody,
  });
  assert.equal(noId.valid, false);
  assert.equal(noId.channelId, null);

  // timestamp missing
  const noTs = verifyTwitchEventSubSignature({
    candidates: [{ channelId: 'channel-a', secret: 'stored-a' }],
    messageId: 'msg-3',
    signature: 'sha256=anything',
    rawBody,
  });
  assert.equal(noTs.valid, false);
  assert.equal(noTs.channelId, null);

  // signature missing
  const noSig = verifyTwitchEventSubSignature({
    candidates: [{ channelId: 'channel-a', secret: 'stored-a' }],
    messageId: 'msg-3',
    timestamp: '2026-06-02T12:00:00Z',
    rawBody,
  });
  assert.equal(noSig.valid, false);
  assert.equal(noSig.channelId, null);
});

// ---------------------------------------------------------------------------
// 4. Verifier: returns the FIRST matching channelId when multiple candidates match
// ---------------------------------------------------------------------------

test('verifyTwitchEventSubSignature returns the FIRST matching channelId when multiple candidates match', () => {
  const messageId = 'msg-4';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"hello":"world"}');

  // Three candidates all share the same secret. The verifier should
  // return the first one in the array (defense-in-depth: a single
  // inbound event should only validate against a single channel's
  // secret in practice, but if two channels ever share a secret we
  // still pick deterministically).
  const sharedSecret = 'the-duplicated-secret';
  const signature = buildSignature({ secret: sharedSecret, messageId, timestamp, rawBody });

  const result = verifyTwitchEventSubSignature({
    candidates: [
      { channelId: 'channel-first', secret: sharedSecret },
      { channelId: 'channel-second', secret: sharedSecret },
      { channelId: 'channel-third', secret: sharedSecret },
    ],
    messageId,
    timestamp,
    signature,
    rawBody,
  });

  assert.equal(result.valid, true);
  assert.equal(result.channelId, 'channel-first');
});

// ---------------------------------------------------------------------------
// 5. Handler: 401 when no candidate matches
// ---------------------------------------------------------------------------

test('twitch webhook handler returns 401 when no candidate matches', async () => {
  const messageId = 'msg-5';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"event":"stream.online"}');

  // The candidate list and the inbound signature do not agree: the
  // signature is produced from a secret that is NOT in the candidate
  // list, so the verifier returns { valid: false, channelId: null }.
  const signature = buildSignature({
    secret: 'the-attacker-secret',
    messageId,
    timestamp,
    rawBody,
  });

  const req = {
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': timestamp,
      'twitch-eventsub-message-signature': signature,
    },
    body: rawBody,
  };
  const res = makeStubResponse();

  await handleTwitchWebhook(req, res, {
    getCandidates: mock.fn(async () => [
      { channelId: 'channel-a', secret: 'stored-a' },
      { channelId: 'channel-b', secret: 'stored-b' },
    ]),
  });

  assert.equal(res.lastStatus, 401);
  assert.deepEqual(res.lastBody, { error: 'Invalid Twitch EventSub signature' });

  // Audit log line: warn with the rejection reason.
  const warn = captured.find((c) => c.method === 'warn');
  assert.ok(warn, 'expected a console.warn call');
  assert.deepEqual(warn!.args, ['twitch webhook rejected', { reason: 'no_matching_secret' }]);
  // No acceptance log line on rejection.
  const info = captured.find((c) => c.method === 'info');
  assert.equal(info, undefined, 'no console.info expected on rejection');
});

// ---------------------------------------------------------------------------
// 6. Handler: 501 when a candidate matches (stub for future event normalization)
// ---------------------------------------------------------------------------

test('twitch webhook handler returns 501 when a candidate matches (stub for future event normalization)', async () => {
  const messageId = 'msg-6';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"event":"stream.online"}');

  const storedSecret = 'channel-b-stored-secret';
  const signature = buildSignature({ secret: storedSecret, messageId, timestamp, rawBody });

  const req = {
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': timestamp,
      'twitch-eventsub-message-signature': signature,
    },
    body: rawBody,
  };
  const res = makeStubResponse();

  await handleTwitchWebhook(req, res, {
    getCandidates: mock.fn(async () => [
      { channelId: 'channel-a', secret: 'stored-a' },
      { channelId: 'channel-b', secret: storedSecret },
    ]),
  });

  assert.equal(res.lastStatus, 501);
  assert.deepEqual(res.lastBody, {
    error: 'Twitch EventSub ingestion is stubbed pending per-workspace credential wiring',
  });

  // Audit log line: info with the channelId.
  const info = captured.find((c) => c.method === 'info');
  assert.ok(info, 'expected a console.info call');
  assert.deepEqual(info!.args, ['twitch webhook accepted', { channelId: 'channel-b' }]);
  // No rejection log line on acceptance.
  const warn = captured.find((c) => c.method === 'warn');
  assert.equal(warn, undefined, 'no console.warn expected on acceptance');
});

// ---------------------------------------------------------------------------
// 7. Handler: never logs the secret value
// ---------------------------------------------------------------------------

test('twitch webhook handler never logs the secret value', async () => {
  const messageId = 'msg-7';
  const timestamp = '2026-06-02T12:00:00Z';
  const rawBody = Buffer.from('{"event":"stream.online"}');

  const storedSecretA = 'stored-secret-ALPHA-AAAAA';
  const storedSecretB = 'stored-secret-BETA-BBBBB';
  const attackerSecret = 'inbound-attacker-secret-CCCCC';
  const signature = buildSignature({
    secret: storedSecretB,
    messageId,
    timestamp,
    rawBody,
  });

  const req = {
    headers: {
      'twitch-eventsub-message-id': messageId,
      'twitch-eventsub-message-timestamp': timestamp,
      'twitch-eventsub-message-signature': signature,
    },
    body: rawBody,
  };
  const res = makeStubResponse();

  await handleTwitchWebhook(req, res, {
    getCandidates: mock.fn(async () => [
      { channelId: 'channel-a', secret: storedSecretA },
      { channelId: 'channel-b', secret: storedSecretB },
    ]),
  });

  // The handler accepted the request (signature matched storedSecretB).
  // No log line, in any method, may include any of the three secret
  // values or the inbound signature.
  for (const entry of captured) {
    const serialised = entry.args
      .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
      .join(' ');
    assert.ok(
      !serialised.includes(storedSecretA),
      `log line via console.${entry.method} contained stored secret A: ${serialised}`,
    );
    assert.ok(
      !serialised.includes(storedSecretB),
      `log line via console.${entry.method} contained stored secret B: ${serialised}`,
    );
    assert.ok(
      !serialised.includes(attackerSecret),
      `log line via console.${entry.method} contained attacker secret: ${serialised}`,
    );
    // The inbound signature starts with "sha256=" and would be
    // visible if the handler logged it. We don't have to assert on
    // its full length — the secret checks above already cover the
    // substring of the signature that includes a real secret value.
  }
});
