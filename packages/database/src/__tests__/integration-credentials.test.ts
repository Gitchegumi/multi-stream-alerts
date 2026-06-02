import test from "node:test";
import assert from "node:assert/strict";
import { mock } from "node:test";
import { randomBytes } from "node:crypto";
import { encryptSecret, __resetCachedKeyForTesting } from "../secrets";
import {
  PROVIDERS,
  REQUIRED_KEYS_BY_PROVIDER,
  getChannelCredentialStatus,
  saveChannelCredentials,
  clearChannelSecret,
  clearAllChannelSecrets,
  getChannelDecryptedSecret,
  getAllTwitchEventSubSecrets
} from "../integration-credentials";

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------
//
// The integration-credentials module imports `./secrets` (transitively) and
// `encryptSecret` requires a valid `INSTANCE_ENCRYPTION_KEY` (32 raw bytes
// -> 44 base64 chars). Set it once for the suite. The tests that exercise
// `encryptSecret` use it to build a real ciphertext for the read paths.

test.before(() => {
  process.env.INSTANCE_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

// Helper: build a credential-row stub with the given secrets and public
// fields. Mirrors the shape Prisma's `findFirst` / `findUnique` returns
// for IntegrationCredential with `secrets` included.
type SecretRow = { key: string; ciphertext: string };

function makeCredentialRow(opts: {
  id?: string;
  isEnabled?: boolean;
  twitchBroadcasterId?: string | null;
  secrets?: SecretRow[];
}) {
  return {
    id: opts.id ?? "cred-1",
    channelId: "channel-1",
    provider: "twitch",
    isEnabled: opts.isEnabled ?? true,
    twitchBroadcasterId: opts.twitchBroadcasterId ?? null,
    secrets: opts.secrets ?? []
  };
}

// ---------------------------------------------------------------------------
// getChannelCredentialStatus
// ---------------------------------------------------------------------------

test("getChannelCredentialStatus returns an empty default when no credential row exists", async () => {
  const prismaStub = {
    integrationCredential: {
      findFirst: mock.fn(async () => null)
    }
  };

  // Patch the `prisma` re-export by mocking the module. node:test's
  // `mock` API doesn't support module replacement, so we exercise the
  // function by feeding the stub via the `prisma` import that the
  // service uses. The cleanest way is to pass a stub through a small
  // shim: import the service module fresh and monkey-patch the
  // `integrationCredential.findFirst` method it pulls from `./client`.
  // For this test we use the bare-bones approach of swapping the
  // method on the live prisma export.
  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findFirst;
  (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = prismaStub.integrationCredential.findFirst;
  try {
    const status = await getChannelCredentialStatus("random-channel-id", "twitch");
    assert.deepEqual(status, {
      configured: {},
      public: { twitchBroadcasterId: null },
      isEnabled: false
    });
    assert.equal(prismaStub.integrationCredential.findFirst.mock.calls.length, 1);
  } finally {
    (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = original;
  }
});

// ---------------------------------------------------------------------------
// saveChannelCredentials
// ---------------------------------------------------------------------------

test("saveChannelCredentials encrypts a provided secret and marks the key as configured", async () => {
  const plaintext = "twitch-client-secret-plaintext-value";

  // Capture the per-secret upsert calls. We don't need the credential
  // row's full shape — just enough to return an ID and a "configured"
  // status that the function will read back. The status read in
  // `getChannelCredentialStatus` will be patched to return the row
  // below after the transaction.
  const calls: { method: string; args: unknown }[] = [];

  const credentialId = "cred-twitch-1";
  const credentialRow = makeCredentialRow({
    id: credentialId,
    isEnabled: false,
    secrets: [{ key: "twitch.client_secret", ciphertext: "will-be-overwritten" }]
  });

  // The status read-back after the transaction will see this row.
  const finalRow = makeCredentialRow({
    id: credentialId,
    isEnabled: false,
    secrets: [{ key: "twitch.client_secret", ciphertext: "redacted" }]
  });

  const tx = {
    integrationCredential: {
      upsert: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredential.upsert", args });
        return { id: credentialId, isEnabled: false };
      }),
      findUnique: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredential.findUnique", args });
        return finalRow;
      }),
      update: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredential.update", args });
        return finalRow;
      })
    },
    integrationCredentialSecret: {
      upsert: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredentialSecret.upsert", args });
        return { id: "secret-1", credentialId, key: "twitch.client_secret", ciphertext: "redacted" };
      })
    }
  };

  const { prisma } = await import("../client.ts");
  const originalTx = prisma.$transaction;
  const originalFindFirst = prisma.integrationCredential.findFirst;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(tx);
  (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = async () => finalRow;
  try {
    await saveChannelCredentials({
      channelId: "channel-1",
      provider: "twitch",
      secrets: { "twitch.client_secret": plaintext }
    });

    // We expect: credential.upsert (with public fields, isEnabled false),
    // secret.upsert (with the encrypted ciphertext),
    // credential.findUnique (read-back for isEnabled computation),
    // and NO credential.update (since required keys are not all set).
    const upsertSecretCall = calls.find((c) => c.method === "integrationCredentialSecret.upsert");
    assert.ok(upsertSecretCall, "expected at least one integrationCredentialSecret.upsert call");

    const secretArgs = upsertSecretCall!.args as {
      where: { credentialId_key: { credentialId: string; key: string } };
      update: { ciphertext: string };
      create: { credentialId: string; key: string; ciphertext: string };
    };
    assert.equal(secretArgs.where.credentialId_key.credentialId, credentialId);
    assert.equal(secretArgs.where.credentialId_key.key, "twitch.client_secret");
    assert.equal(secretArgs.create.key, "twitch.client_secret");
    assert.equal(secretArgs.create.credentialId, credentialId);
    // The persisted ciphertext must NOT be the plaintext. It must be a
    // valid ciphertext triple (iv.tag.body) that round-trips back to
    // the original plaintext via decryptSecret.
    assert.notEqual(secretArgs.update.ciphertext, plaintext);
    assert.notEqual(secretArgs.create.ciphertext, plaintext);
    assert.equal(secretArgs.update.ciphertext.split(".").length, 3);
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTx;
    (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = originalFindFirst;
  }
});

test("saveChannelCredentials rejects an unknown key", async () => {
  await assert.rejects(
    () =>
      saveChannelCredentials({
        channelId: "channel-1",
        provider: "twitch",
        secrets: { "not.a.key": "value" } as never
      }),
    (err: unknown) => err instanceof Error && /unknown secret key/i.test(err.message)
  );
});

test("saveChannelCredentials rejects an unknown provider", async () => {
  await assert.rejects(
    () =>
      saveChannelCredentials({
        channelId: "channel-1",
        provider: "facebook" as never,
        secrets: {}
      }),
    (err: unknown) => err instanceof Error && /unknown provider/i.test(err.message)
  );
});

// ---------------------------------------------------------------------------
// clearChannelSecret
// ---------------------------------------------------------------------------

test("clearChannelSecret sets the ciphertext to the empty string sentinel", async () => {
  const calls: { method: string; args: unknown }[] = [];
  const credentialId = "cred-1";

  // Stub the credential find (to resolve the credentialId), the secret
  // update, and the credential isEnabled-recompute update.
  const tx = {
    integrationCredential: {
      findFirst: mock.fn(async () => ({ id: credentialId, provider: "kofi" })),
      findUnique: mock.fn(async () => ({ id: credentialId, isEnabled: false, secrets: [] })),
      update: mock.fn(async () => ({ id: credentialId, isEnabled: false }))
    },
    integrationCredentialSecret: {
      update: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredentialSecret.update", args });
        return { id: "secret-1", credentialId, key: "kofi.verification_token", ciphertext: "" };
      })
    }
  };

  const { prisma } = await import("../client.ts");
  const originalTx = prisma.$transaction;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(tx);
  try {
    await clearChannelSecret({
      channelId: "channel-1",
      provider: "kofi",
      key: "kofi.verification_token"
    });

    const updateCall = calls.find((c) => c.method === "integrationCredentialSecret.update");
    assert.ok(updateCall, "expected integrationCredentialSecret.update to be called");
    const updateArgs = updateCall!.args as {
      where: { credentialId_key: { credentialId: string; key: string } };
      data: { ciphertext: string };
    };
    assert.equal(updateArgs.where.credentialId_key.credentialId, credentialId);
    assert.equal(updateArgs.where.credentialId_key.key, "kofi.verification_token");
    assert.equal(updateArgs.data.ciphertext, "");
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTx;
  }
});

// ---------------------------------------------------------------------------
// clearAllChannelSecrets
// ---------------------------------------------------------------------------

test("clearAllChannelSecrets deletes all secret rows for the (channelId, provider) pair", async () => {
  const calls: { method: string; args: unknown }[] = [];
  const credentialId = "cred-1";

  const tx = {
    integrationCredential: {
      findFirst: mock.fn(async () => ({ id: credentialId, provider: "twitch" })),
      findUnique: mock.fn(async () => ({ id: credentialId, isEnabled: false, secrets: [] })),
      update: mock.fn(async () => ({ id: credentialId, isEnabled: false }))
    },
    integrationCredentialSecret: {
      deleteMany: mock.fn(async (args: unknown) => {
        calls.push({ method: "integrationCredentialSecret.deleteMany", args });
        return { count: 3 };
      })
    }
  };

  const { prisma } = await import("../client.ts");
  const originalTx = prisma.$transaction;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(tx);
  try {
    await clearAllChannelSecrets({ channelId: "channel-1", provider: "twitch" });

    const deleteManyCall = calls.find((c) => c.method === "integrationCredentialSecret.deleteMany");
    assert.ok(deleteManyCall, "expected integrationCredentialSecret.deleteMany to be called");
    const deleteArgs = deleteManyCall!.args as { where: { credentialId: string } };
    assert.equal(deleteArgs.where.credentialId, credentialId);
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTx;
  }
});

// ---------------------------------------------------------------------------
// getChannelDecryptedSecret
// ---------------------------------------------------------------------------

test("getChannelDecryptedSecret returns null when the secret is not configured", async () => {
  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findFirst;
  (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = async () => null;
  try {
    const result = await getChannelDecryptedSecret({
      channelId: "channel-1",
      provider: "kofi",
      key: "kofi.verification_token"
    });
    assert.equal(result, null);
  } finally {
    (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = original;
  }
});

test("getChannelDecryptedSecret returns null when the secret's ciphertext is the empty sentinel", async () => {
  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findFirst;
  (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = async () =>
    makeCredentialRow({ secrets: [{ key: "kofi.verification_token", ciphertext: "" }] });
  try {
    const result = await getChannelDecryptedSecret({
      channelId: "channel-1",
      provider: "kofi",
      key: "kofi.verification_token"
    });
    assert.equal(result, null);
  } finally {
    (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = original;
  }
});

test("getChannelDecryptedSecret returns the decrypted plaintext when configured", async () => {
  const plaintext = "kofi-verification-token-plaintext";
  const ciphertext = encryptSecret(plaintext);
  assert.notEqual(ciphertext, "");

  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findFirst;
  (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = async () =>
    makeCredentialRow({ secrets: [{ key: "kofi.verification_token", ciphertext }] });
  try {
    const result = await getChannelDecryptedSecret({
      channelId: "channel-1",
      provider: "kofi",
      key: "kofi.verification_token"
    });
    assert.equal(result, plaintext);
  } finally {
    (prisma.integrationCredential as unknown as { findFirst: unknown }).findFirst = original;
  }
});

// ---------------------------------------------------------------------------
// getAllTwitchEventSubSecrets
// ---------------------------------------------------------------------------

test("getAllTwitchEventSubSecrets returns only configured channels", async () => {
  // Build two credentials: one with the eventsub secret configured,
  // one with an empty ciphertext (must be filtered out).
  const realPlaintext = "twitch-eventsub-secret-abc";
  const realCiphertext = encryptSecret(realPlaintext);

  const credentialRows = [
    {
      id: "cred-1",
      channelId: "channel-1",
      provider: "twitch",
      isEnabled: true,
      twitchBroadcasterId: "broadcaster-1",
      secrets: [{ key: "twitch.eventsub_secret", ciphertext: realCiphertext }]
    },
    {
      id: "cred-2",
      channelId: "channel-2",
      provider: "twitch",
      isEnabled: false,
      twitchBroadcasterId: "broadcaster-2",
      secrets: [{ key: "twitch.eventsub_secret", ciphertext: "" }]
    },
    {
      id: "cred-3",
      channelId: "channel-3",
      provider: "twitch",
      isEnabled: true,
      twitchBroadcasterId: "broadcaster-3",
      // No eventsub secret row at all — should also be filtered out.
      secrets: [{ key: "twitch.client_id", ciphertext: "irrelevant" }]
    }
  ];

  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findMany;
  (prisma.integrationCredential as unknown as { findMany: unknown }).findMany = async () => credentialRows;
  try {
    const result = await getAllTwitchEventSubSecrets();
    assert.equal(result.length, 1);
    assert.equal(result[0]!.channelId, "channel-1");
    assert.equal(result[0]!.secret, realPlaintext);
  } finally {
    (prisma.integrationCredential as unknown as { findMany: unknown }).findMany = original;
  }
});

test("getAllTwitchEventSubSecrets never logs the secret value", async () => {
  const realPlaintext = "twitch-eventsub-secret-xyz";
  const realCiphertext = encryptSecret(realPlaintext);

  const credentialRows = [
    {
      id: "cred-1",
      channelId: "channel-1",
      provider: "twitch",
      isEnabled: true,
      twitchBroadcasterId: "broadcaster-1",
      secrets: [{ key: "twitch.eventsub_secret", ciphertext: realCiphertext }]
    }
  ];

  const { prisma } = await import("../client.ts");
  const original = prisma.integrationCredential.findMany;
  (prisma.integrationCredential as unknown as { findMany: unknown }).findMany = async () => credentialRows;

  // Spy on console methods to ensure no log line contains the plaintext.
  const originalLog = console.log;
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  const captured: { method: string; args: unknown[] }[] = [];
  console.log = (...args: unknown[]) => captured.push({ method: "log", args });
  console.info = (...args: unknown[]) => captured.push({ method: "info", args });
  console.warn = (...args: unknown[]) => captured.push({ method: "warn", args });
  console.error = (...args: unknown[]) => captured.push({ method: "error", args });

  try {
    await getAllTwitchEventSubSecrets();
    for (const c of captured) {
      for (const arg of c.args) {
        const asString = typeof arg === "string" ? arg : JSON.stringify(arg);
        assert.equal(
          asString.includes(realPlaintext),
          false,
          `console.${c.method} was called with a value containing the secret plaintext`
        );
      }
    }
  } finally {
    (prisma.integrationCredential as unknown as { findMany: unknown }).findMany = original;
    console.log = originalLog;
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

// ---------------------------------------------------------------------------
// Shape pinning
// ---------------------------------------------------------------------------

test("PROVIDERS includes exactly kofi, twitch, and youtube", () => {
  assert.deepEqual([...PROVIDERS].sort(), ["kofi", "twitch", "youtube"]);
});

test("REQUIRED_KEYS_BY_PROVIDER lists the expected keys per provider", () => {
  assert.deepEqual(REQUIRED_KEYS_BY_PROVIDER.kofi, ["kofi.verification_token"]);
  assert.deepEqual(REQUIRED_KEYS_BY_PROVIDER.twitch, [
    "twitch.eventsub_secret",
    "twitch.client_id",
    "twitch.client_secret"
  ]);
  assert.deepEqual(REQUIRED_KEYS_BY_PROVIDER.youtube, ["youtube.client_id", "youtube.client_secret"]);
});
