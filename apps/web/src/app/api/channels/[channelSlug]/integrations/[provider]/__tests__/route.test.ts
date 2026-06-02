import test from "node:test";
import assert from "node:assert/strict";
import {
  handleDelete,
  handleGet,
  handlePut,
  type HandlerDeps,
  type HandlerSession
} from "../route.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeSession(role: "admin" | "owner" | "editor" | "viewer" = "admin"): HandlerSession {
  return { user: { id: "user-1", role } };
}

function makeChannelRow(overrides: Partial<{ id: string; slug: string }> = {}) {
  return {
    id: overrides.id ?? "channel-1",
    slug: overrides.slug ?? "main",
    name: "Main Channel",
    ownerUserId: "user-1",
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

type MockDeps = {
  prisma: {
    channel: {
      findUnique: (args: { where: { slug: string } }) => Promise<ReturnType<typeof makeChannelRow> | null>;
    };
  };
  canViewChannel: (userId: string, role: string, channelId: string) => Promise<boolean>;
  canManageChannelCredentials: (userId: string, role: string, channelId: string) => Promise<boolean>;
  getChannelCredentialStatus: (channelId: string, provider: string) => Promise<{
    configured: Record<string, boolean>;
    public: { twitchBroadcasterId: string | null };
    isEnabled: boolean;
  }>;
  saveChannelCredentials: (input: unknown) => Promise<{
    configured: Record<string, boolean>;
    public: { twitchBroadcasterId: string | null };
    isEnabled: boolean;
  }>;
  clearChannelSecret: (input: { channelId: string; provider: string; key: string }) => Promise<void>;
  clearAllChannelSecrets: (input: { channelId: string; provider: string }) => Promise<void>;
};

function makeDeps(overrides: Partial<MockDeps> = {}): HandlerDeps {
  const calls = {
    saveChannelCredentials: [] as unknown[],
    clearChannelSecret: [] as Array<{ channelId: string; provider: string; key: string }>,
    clearAllChannelSecrets: [] as Array<{ channelId: string; provider: string }>
  };

  const deps: MockDeps = {
    prisma: {
      channel: {
        findUnique: async () => makeChannelRow()
      }
    },
    canViewChannel: async () => true,
    canManageChannelCredentials: async () => true,
    getChannelCredentialStatus: async () => ({
      configured: { "kofi.verification_token": true },
      public: { twitchBroadcasterId: null },
      isEnabled: true
    }),
    saveChannelCredentials: async (input) => {
      calls.saveChannelCredentials.push(input);
      return {
        configured: {},
        public: { twitchBroadcasterId: null },
        isEnabled: false
      };
    },
    clearChannelSecret: async (input) => {
      calls.clearChannelSecret.push(input);
    },
    clearAllChannelSecrets: async (input) => {
      calls.clearAllChannelSecrets.push(input);
    },
    ...overrides
  };

  // Attach the calls object for test inspection. Cast through unknown
  // because the public type HandlerDeps uses the real `prisma` type but
  // our test deps are narrower — both are structurally compatible for
  // what the handler uses.
  (deps as unknown as { calls: typeof calls }).calls = calls;
  return deps as unknown as HandlerDeps;
}

// ---------------------------------------------------------------------------
// 1. GET returns 200 with the status shape, no secrets/ciphertext
// ---------------------------------------------------------------------------

test("handleGet returns 200 with the status shape, no ciphertext or secrets", async () => {
  const deps = makeDeps({
    getChannelCredentialStatus: async () => ({
      configured: { "kofi.verification_token": true },
      public: { twitchBroadcasterId: "12345" },
      isEnabled: true
    })
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    deps
  });

  assert.equal(result.status, 200);
  const body = result.body as {
    configured: Record<string, boolean>;
    public: { twitchBroadcasterId: string | null };
    isEnabled: boolean;
  };
  assert.deepEqual(body.configured, { "kofi.verification_token": true });
  assert.equal(body.public.twitchBroadcasterId, "12345");
  assert.equal(body.isEnabled, true);
  assert.equal(result.headers?.["Cache-Control"], "no-store");

  // Belt-and-suspenders: the status shape must not include a ciphertext
  // or any non-serializable handle. We assert against the serialized
  // JSON keys to be sure.
  const keys = Object.keys(body);
  assert.deepEqual(keys.sort(), ["configured", "isEnabled", "public"]);
});

// ---------------------------------------------------------------------------
// 2. GET returns 404 when the channel slug does not resolve
// ---------------------------------------------------------------------------

test("handleGet returns 404 when the channel slug does not resolve", async () => {
  const deps = makeDeps({
    prisma: {
      channel: {
        findUnique: async () => null
      }
    }
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: "does-not-exist",
    provider: "kofi",
    deps
  });

  assert.equal(result.status, 404);
  assert.deepEqual(result.body, { error: "Channel not found" });
});

// ---------------------------------------------------------------------------
// 3. GET returns 403 when the caller cannot view the channel
// ---------------------------------------------------------------------------

test("handleGet returns 403 when the caller cannot view the channel", async () => {
  const deps = makeDeps({
    canViewChannel: async () => false
  });

  const result = await handleGet({
    session: makeSession("editor"),
    channelSlug: "main",
    provider: "kofi",
    deps
  });

  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "Forbidden" });
});

// ---------------------------------------------------------------------------
// 4. GET never includes ciphertext in the response (regression guard)
// ---------------------------------------------------------------------------

test("handleGet never includes ciphertext in the response even if the status object is leaky", async () => {
  // Simulate a future refactor where someone accidentally passes through
  // a `ciphertext` field. The handler must project to the documented
  // status shape and drop anything else.
  const deps = makeDeps({
    getChannelCredentialStatus: async () =>
      ({
        configured: { "kofi.verification_token": true },
        public: { twitchBroadcasterId: "12345" },
        isEnabled: true,
        // Sneaky fields a future refactor might add by accident:
        ciphertext: "leaked-ciphertext",
        plaintext: "leaked-plaintext",
        secrets: { "kofi.verification_token": "leaked" }
      } as unknown as Awaited<ReturnType<MockDeps["getChannelCredentialStatus"]>>)
  });

  const result = await handleGet({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    deps
  });

  assert.equal(result.status, 200);
  const body = result.body as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(body, "ciphertext"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "plaintext"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body, "secrets"), false);
});

// ---------------------------------------------------------------------------
// 5. PUT returns 403 for an editor
// ---------------------------------------------------------------------------

test("handlePut returns 403 for an editor", async () => {
  const deps = makeDeps({
    canManageChannelCredentials: async () => false
  });

  const result = await handlePut({
    session: makeSession("editor"),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { verificationToken: "abc" },
    deps
  });

  assert.equal(result.status, 403);
  // Save must NOT have been called.
  const calls = (deps as unknown as { calls: { saveChannelCredentials: unknown[] } }).calls;
  assert.equal(calls.saveChannelCredentials.length, 0);
});

// ---------------------------------------------------------------------------
// 6. PUT with verificationToken: "" calls clearChannelSecret, NOT saveChannelCredentials
// ---------------------------------------------------------------------------

test("handlePut with verificationToken: '' calls clearChannelSecret and never saveChannelCredentials", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as {
    calls: {
      saveChannelCredentials: unknown[];
      clearChannelSecret: Array<{ channelId: string; provider: string; key: string }>;
    };
  }).calls;

  const result = await handlePut({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { verificationToken: "" },
    deps
  });

  assert.equal(result.status, 200);
  assert.equal(calls.clearChannelSecret.length, 1);
  assert.deepEqual(calls.clearChannelSecret[0], {
    channelId: "channel-1",
    provider: "kofi",
    key: "kofi.verification_token"
  });
  assert.equal(calls.saveChannelCredentials.length, 0);
});

// ---------------------------------------------------------------------------
// 7. PUT with a non-empty value calls saveChannelCredentials and never echoes plaintext
// ---------------------------------------------------------------------------

test("handlePut with a non-empty value calls saveChannelCredentials and never echoes plaintext", async () => {
  const PLAINTEXT = "a-very-secret-token-1234567890abcdef";
  const deps = makeDeps();
  const calls = (deps as unknown as { calls: { saveChannelCredentials: unknown[] } }).calls;

  const result = await handlePut({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { verificationToken: PLAINTEXT },
    deps
  });

  assert.equal(result.status, 200);

  // saveChannelCredentials was called exactly once with the right key/value.
  assert.equal(calls.saveChannelCredentials.length, 1);
  const saved = calls.saveChannelCredentials[0] as {
    channelId: string;
    provider: string;
    secrets: Record<string, string>;
  };
  assert.equal(saved.channelId, "channel-1");
  assert.equal(saved.provider, "kofi");
  assert.equal(saved.secrets["kofi.verification_token"], PLAINTEXT);

  // The response is the status shape, not the saved values. The
  // plaintext must not appear anywhere in the response body.
  const json = JSON.stringify(result.body);
  assert.equal(json.includes(PLAINTEXT), false, "response body must not contain the plaintext");
});

// ---------------------------------------------------------------------------
// 8. PUT with an invalid provider returns 400
// ---------------------------------------------------------------------------

test("handlePut with an invalid provider returns 400", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as {
    calls: { saveChannelCredentials: unknown[]; clearChannelSecret: unknown[] };
  }).calls;

  const result = await handlePut({
    session: makeSession(),
    channelSlug: "main",
    provider: "spotify", // not a real provider
    rawBody: { verificationToken: "abc" },
    deps
  });

  assert.equal(result.status, 400);
  assert.equal(calls.saveChannelCredentials.length, 0);
  assert.equal(calls.clearChannelSecret.length, 0);
});

// ---------------------------------------------------------------------------
// 9. PUT with malformed JSON body returns 400
// ---------------------------------------------------------------------------

test("handlePut with malformed body returns 400", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as { calls: { saveChannelCredentials: unknown[] } }).calls;

  // kofi requires `verificationToken` to be a string <= 256. Passing
  // an object that doesn't match should fail the Zod schema and return
  // 400 without calling any service.
  const result = await handlePut({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { verificationToken: 12345 }, // wrong type
    deps
  });

  assert.equal(result.status, 400);
  assert.equal(calls.saveChannelCredentials.length, 0);
});

// ---------------------------------------------------------------------------
// 10. DELETE with { key } calls clearChannelSecret and returns 204
// ---------------------------------------------------------------------------

test("handleDelete with { key: 'kofi.verification_token' } calls clearChannelSecret and returns 204", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as {
    calls: {
      clearChannelSecret: Array<{ channelId: string; provider: string; key: string }>;
      clearAllChannelSecrets: unknown[];
    };
  }).calls;

  const result = await handleDelete({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { key: "kofi.verification_token" },
    deps
  });

  assert.equal(result.status, 204);
  assert.equal(calls.clearChannelSecret.length, 1);
  assert.deepEqual(calls.clearChannelSecret[0], {
    channelId: "channel-1",
    provider: "kofi",
    key: "kofi.verification_token"
  });
  assert.equal(calls.clearAllChannelSecrets.length, 0);
});

// ---------------------------------------------------------------------------
// 11. DELETE with { all: true } calls clearAllChannelSecrets and returns 204
// ---------------------------------------------------------------------------

test("handleDelete with { all: true } calls clearAllChannelSecrets and returns 204", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as {
    calls: {
      clearChannelSecret: unknown[];
      clearAllChannelSecrets: Array<{ channelId: string; provider: string }>;
    };
  }).calls;

  const result = await handleDelete({
    session: makeSession(),
    channelSlug: "main",
    provider: "twitch",
    rawBody: { all: true },
    deps
  });

  assert.equal(result.status, 204);
  assert.equal(calls.clearChannelSecret.length, 0);
  assert.equal(calls.clearAllChannelSecrets.length, 1);
  assert.deepEqual(calls.clearAllChannelSecrets[0], {
    channelId: "channel-1",
    provider: "twitch"
  });
});

// ---------------------------------------------------------------------------
// 12. DELETE with neither key nor all returns 400
// ---------------------------------------------------------------------------

test("handleDelete with neither key nor all returns 400", async () => {
  const deps = makeDeps();
  const calls = (deps as unknown as {
    calls: { clearChannelSecret: unknown[]; clearAllChannelSecrets: unknown[] };
  }).calls;

  const result = await handleDelete({
    session: makeSession(),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { something: "else" },
    deps
  });

  assert.equal(result.status, 400);
  assert.equal(calls.clearChannelSecret.length, 0);
  assert.equal(calls.clearAllChannelSecrets.length, 0);
});

// ---------------------------------------------------------------------------
// 13. DELETE returns 403 for an editor
// ---------------------------------------------------------------------------

test("handleDelete returns 403 for an editor", async () => {
  const deps = makeDeps({
    canManageChannelCredentials: async () => false
  });
  const calls = (deps as unknown as {
    calls: { clearChannelSecret: unknown[]; clearAllChannelSecrets: unknown[] };
  }).calls;

  const result = await handleDelete({
    session: makeSession("editor"),
    channelSlug: "main",
    provider: "kofi",
    rawBody: { key: "kofi.verification_token" },
    deps
  });

  assert.equal(result.status, 403);
  assert.equal(calls.clearChannelSecret.length, 0);
  assert.equal(calls.clearAllChannelSecrets.length, 0);
});
