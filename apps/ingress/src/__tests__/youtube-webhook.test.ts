import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { handleYoutubeWebhook } from "../youtube-webhook.js";

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
    lastBody: undefined
  };
  stub.status = (code: number) => {
    stub.lastStatus = code;
    return {
      json: (body: unknown) => {
        stub.lastBody = body;
      }
    };
  };
  return stub;
}

// Capture console output across the suite so tests can assert on log
// lines (and verify the client_id / client_secret are never written to
// the logs). We replace console methods with spies that push into a
// shared `captured` array, then restore the originals in `afterEach`.

type CapturedLog = { method: "log" | "info" | "warn" | "error"; args: unknown[] };

const captured: CapturedLog[] = [];
const originalLog = console.log;
const originalInfo = console.info;
const originalWarn = console.warn;
const originalError = console.error;

test.beforeEach(() => {
  captured.length = 0;
  console.log = (...args: unknown[]) => captured.push({ method: "log", args });
  console.info = (...args: unknown[]) => captured.push({ method: "info", args });
  console.warn = (...args: unknown[]) => captured.push({ method: "warn", args });
  console.error = (...args: unknown[]) => captured.push({ method: "error", args });
});

test.afterEach(() => {
  console.log = originalLog;
  console.info = originalInfo;
  console.warn = originalWarn;
  console.error = originalError;
});

// ---------------------------------------------------------------------------
// 1. Channel not found -> 404
// ---------------------------------------------------------------------------

test("returns 404 when the channel slug doesn't resolve", async () => {
  const findChannel = mock.fn(async (_slug: string) => null);
  const getClientId = mock.fn(async (_channelId: string) => "stored-client-id");
  const getClientSecret = mock.fn(async (_channelId: string) => "stored-client-secret");

  const req = { params: { channelSlug: "missing-channel" }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  assert.equal(res.lastStatus, 404);
  assert.deepEqual(res.lastBody, { error: "Channel not found" });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(findChannel.mock.calls[0]?.arguments[0], "missing-channel");
  // No further work should happen if the channel is missing.
  assert.equal(getClientId.mock.callCount(), 0);
  assert.equal(getClientSecret.mock.callCount(), 0);

  // Audit log line present with the channel slug and the rejection reason.
  const warn = captured.find((c) => c.method === "warn");
  assert.ok(warn, "expected a console.warn call");
  assert.deepEqual(warn!.args, [
    "youtube webhook rejected",
    { channelSlug: "missing-channel", reason: "channel_not_found" }
  ]);
});

// ---------------------------------------------------------------------------
// 2. Channel exists but no YouTube credentials stored -> 503
// ---------------------------------------------------------------------------

test("returns 503 when the channel exists but YouTube credentials are not stored", async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: "channel-1", slug: "alpha" }));
  // Both secrets missing — neither key has been written to the DB.
  const getClientId = mock.fn(async (_channelId: string) => null);
  const getClientSecret = mock.fn(async (_channelId: string) => null);

  const req = { params: { channelSlug: "alpha" }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: "YouTube not configured for this channel" });
  // Both lookups are issued in parallel; the handler must call both.
  assert.equal(getClientId.mock.callCount(), 1);
  assert.equal(getClientSecret.mock.callCount(), 1);
  assert.equal(getClientId.mock.calls[0]?.arguments[0], "channel-1");
  assert.equal(getClientSecret.mock.calls[0]?.arguments[0], "channel-1");

  const warn = captured.find((c) => c.method === "warn");
  assert.deepEqual(warn!.args, [
    "youtube webhook rejected",
    { channelSlug: "alpha", reason: "not_configured" }
  ]);
});

// ---------------------------------------------------------------------------
// 2b. Partially configured (client_id present, secret missing) -> 503
// ---------------------------------------------------------------------------

test("returns 503 when only one of the YouTube credentials is stored", async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: "channel-1", slug: "alpha" }));
  const getClientId = mock.fn(async (_channelId: string) => "stored-client-id");
  const getClientSecret = mock.fn(async (_channelId: string) => null);

  const req = { params: { channelSlug: "alpha" }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  assert.equal(res.lastStatus, 503);
  assert.deepEqual(res.lastBody, { error: "YouTube not configured for this channel" });

  const warn = captured.find((c) => c.method === "warn");
  assert.deepEqual(warn!.args, [
    "youtube webhook rejected",
    { channelSlug: "alpha", reason: "not_configured" }
  ]);
});

// ---------------------------------------------------------------------------
// 3. Fully configured -> 501 stub
// ---------------------------------------------------------------------------

test("returns 501 with the stub message on a fully-configured channel", async () => {
  const findChannel = mock.fn(async (_slug: string) => ({ id: "channel-1", slug: "alpha" }));
  const getClientId = mock.fn(async (_channelId: string) => "stored-client-id");
  const getClientSecret = mock.fn(async (_channelId: string) => "stored-client-secret");

  const req = { params: { channelSlug: "alpha" }, body: { hello: "world" } };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  assert.equal(res.lastStatus, 501);
  assert.deepEqual(res.lastBody, { error: "YouTube ingestion is stubbed for future implementation" });
  assert.equal(findChannel.mock.callCount(), 1);
  assert.equal(getClientId.mock.callCount(), 1);
  assert.equal(getClientSecret.mock.callCount(), 1);

  // The accepted log line must include channelSlug and channelId.
  const info = captured.find((c) => c.method === "info");
  assert.ok(info, "expected a console.info call");
  assert.equal(info!.args[0], "youtube webhook accepted");
  const logPayload = info!.args[1] as { channelSlug: string; channelId: string };
  assert.equal(logPayload.channelSlug, "alpha");
  assert.equal(logPayload.channelId, "channel-1");
});

// ---------------------------------------------------------------------------
// 4. Log lines never include the client_id or client_secret value
// ---------------------------------------------------------------------------

test("the 'credentials missing' log line never includes the client id or secret", async () => {
  const expectedClientId = "stored-client-id-AAA-111";
  const expectedClientSecret = "stored-client-secret-BBB-222";

  const findChannel = mock.fn(async (_slug: string) => null); // channel_not_found path
  // Provide functions that would leak the credential values, but they
  // should never be called on this code path.
  const getClientId = mock.fn(async (_channelId: string) => expectedClientId);
  const getClientSecret = mock.fn(async (_channelId: string) => expectedClientSecret);

  const req = { params: { channelSlug: "alpha" }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  for (const entry of captured) {
    const serialised = entry.args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");
    assert.ok(
      !serialised.includes(expectedClientId),
      `log line via console.${entry.method} contained the client id: ${serialised}`
    );
    assert.ok(
      !serialised.includes(expectedClientSecret),
      `log line via console.${entry.method} contained the client secret: ${serialised}`
    );
  }
});

test("the 'accepted' log line includes channelSlug and channelId, not the secret values", async () => {
  const expectedClientId = "stored-client-id-AAA-111";
  const expectedClientSecret = "stored-client-secret-BBB-222";

  const findChannel = mock.fn(async (_slug: string) => ({ id: "channel-1", slug: "alpha" }));
  const getClientId = mock.fn(async (_channelId: string) => expectedClientId);
  const getClientSecret = mock.fn(async (_channelId: string) => expectedClientSecret);

  const req = { params: { channelSlug: "alpha" }, body: {} };
  const res = makeStubResponse();
  await handleYoutubeWebhook(req, res, {
    findChannelBySlug: findChannel,
    getDecryptedClientId: getClientId,
    getDecryptedClientSecret: getClientSecret
  });

  const info = captured.find((c) => c.method === "info");
  assert.ok(info, "expected a console.info call");
  const logPayload = info!.args[1] as { channelSlug: string; channelId: string };
  // The IDs are the only credential-derived identifiers in the log line.
  assert.equal(logPayload.channelSlug, "alpha");
  assert.equal(logPayload.channelId, "channel-1");
  // The raw secret values must never appear anywhere in the log line.
  const serialised = info!.args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  assert.ok(
    !serialised.includes(expectedClientId),
    `accepted log line contained the client id: ${serialised}`
  );
  assert.ok(
    !serialised.includes(expectedClientSecret),
    `accepted log line contained the client secret: ${serialised}`
  );
});
