import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { encryptSecret, decryptSecret, redact } from "./secrets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Literal type union for the valid credential keys. Keep in sync with
 * the comment block in packages/database/prisma/schema.prisma.
 */
export type IntegrationCredentialKey =
  | "kofi.verification_token"
  | "twitch.eventsub_secret"
  | "twitch.client_id"
  | "twitch.client_secret"
  | "youtube.client_id"
  | "youtube.client_secret";

export const PROVIDERS = ["kofi", "twitch", "youtube"] as const;
export type IntegrationProvider = (typeof PROVIDERS)[number];

/**
 * Public type for the "configured" status returned to the UI. The
 * `configured` map is intentionally a `Partial<Record<...>>` keyed by
 * credential key — a missing key means "not configured" and a `true`
 * value means "has a non-empty ciphertext". The status never includes
 * any secret value or ciphertext.
 */
export type CredentialStatus = {
  configured: Partial<Record<IntegrationCredentialKey, boolean>>;
  public: {
    twitchBroadcasterId: string | null;
  };
  isEnabled: boolean;
};

/**
 * Keys for which `save` accepts a non-empty value (Task 6 will validate
 * input against this list per provider). The set is what `isEnabled`
 * evaluates against: a provider is "enabled" iff every required key for
 * that provider has a non-empty ciphertext.
 */
export const REQUIRED_KEYS_BY_PROVIDER: Record<IntegrationProvider, IntegrationCredentialKey[]> = {
  kofi: ["kofi.verification_token"],
  twitch: ["twitch.eventsub_secret", "twitch.client_id", "twitch.client_secret"],
  youtube: ["youtube.client_id", "youtube.client_secret"]
};

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const ALL_VALID_KEYS: ReadonlySet<string> = new Set<IntegrationCredentialKey>([
  "kofi.verification_token",
  "twitch.eventsub_secret",
  "twitch.client_id",
  "twitch.client_secret",
  "youtube.client_id",
  "youtube.client_secret"
]);

const ALL_VALID_PROVIDERS: ReadonlySet<string> = new Set<IntegrationProvider>(PROVIDERS);

function assertValidKey(key: string): asserts key is IntegrationCredentialKey {
  if (!ALL_VALID_KEYS.has(key)) {
    throw new Error(`Unknown secret key: ${redact(key)}`);
  }
}

function assertValidProvider(provider: string): asserts provider is IntegrationProvider {
  if (!ALL_VALID_PROVIDERS.has(provider)) {
    throw new Error(`Unknown provider: ${redact(provider)}`);
  }
}

// ---------------------------------------------------------------------------
// Status building
// ---------------------------------------------------------------------------

/**
 * Build a `CredentialStatus` from a credential row (with secrets). If
 * the row is null, returns the default-empty status. NEVER includes
 * ciphertext — only the boolean "is this key set" map.
 */
function buildStatus(
  row:
    | (Prisma.IntegrationCredentialGetPayload<{ include: { secrets: true } }> | null)
    | null
): CredentialStatus {
  if (!row) {
    return {
      configured: {},
      public: { twitchBroadcasterId: null },
      isEnabled: false
    };
  }

  const configured: Partial<Record<IntegrationCredentialKey, boolean>> = {};
  for (const secret of row.secrets) {
    // The DB stores `ciphertext === ""` as the "cleared" sentinel. Only
    // a non-empty ciphertext means "this key is configured".
    if (secret.ciphertext !== "") {
      // Trust the schema enum comment for valid keys; ignore any
      // garbage that somehow made it into the DB.
      if (ALL_VALID_KEYS.has(secret.key)) {
        configured[secret.key as IntegrationCredentialKey] = true;
      }
    }
  }

  return {
    configured,
    public: { twitchBroadcasterId: row.twitchBroadcasterId },
    isEnabled: row.isEnabled
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Read the current configured status of a (channelId, provider) pair.
 * Returns a default-empty object if no credential row exists yet.
 * MUST NOT include any secret value or ciphertext in the result.
 */
export async function getChannelCredentialStatus(
  channelId: string,
  provider: IntegrationProvider
): Promise<CredentialStatus> {
  assertValidProvider(provider);
  const row = await prisma.integrationCredential.findFirst({
    where: { channelId, provider },
    include: { secrets: true }
  });
  return buildStatus(row);
}

/**
 * Decrypt and return a single secret, or null if not configured. Used
 * by the ingress webhook handlers in Tasks 8/9.
 */
export async function getChannelDecryptedSecret(input: {
  channelId: string;
  provider: IntegrationProvider;
  key: IntegrationCredentialKey;
}): Promise<string | null> {
  assertValidProvider(input.provider);
  assertValidKey(input.key);

  const row = await prisma.integrationCredential.findFirst({
    where: { channelId: input.channelId, provider: input.provider },
    include: { secrets: true }
  });
  if (!row) return null;

  const secret = row.secrets.find((s) => s.key === input.key);
  if (!secret) return null;
  if (secret.ciphertext === "") return null;
  return decryptSecret(secret.ciphertext);
}

/**
 * Return all (channelId, decrypted eventsub secret) pairs for the
 * Twitch webhook match-loop. ONLY returns channels that have
 * `twitch.eventsub_secret` configured (non-empty ciphertext). NEVER
 * logs the secret value.
 */
export async function getAllTwitchEventSubSecrets(): Promise<
  Array<{ channelId: string; secret: string }>
> {
  const rows = await prisma.integrationCredential.findMany({
    where: { provider: "twitch" },
    include: { secrets: true }
  });

  const out: Array<{ channelId: string; secret: string }> = [];
  for (const row of rows) {
    const secret = row.secrets.find((s) => s.key === "twitch.eventsub_secret");
    if (!secret || secret.ciphertext === "") continue;
    out.push({ channelId: row.channelId, secret: decryptSecret(secret.ciphertext) });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Upsert the credential row, then write the provided secrets
 * (encrypting each). Transactional: if the partial `secrets` update
 * fails halfway, no half-state should land.
 *
 * - For each key in `secrets`: encrypt with `encryptSecret` and upsert
 *   the IntegrationCredentialSecret row. Empty string -> ciphertext ""
 *   (sentinel for "cleared").
 * - Keys not in `secrets` are left untouched.
 * - If `publicFields` is provided, update the credential row's public
 *   columns (e.g. twitchBroadcasterId).
 * - Set `isEnabled` to (every REQUIRED_KEYS_BY_PROVIDER[provider] has
 *   a non-empty ciphertext) after the write.
 *
 * Returns the new status (via getChannelCredentialStatus).
 *
 * Throws if any key in `secrets` is not a valid `IntegrationCredentialKey`,
 * or if `provider` is not a valid `IntegrationProvider`.
 */
export async function saveChannelCredentials(input: {
  channelId: string;
  provider: IntegrationProvider;
  secrets: Partial<Record<IntegrationCredentialKey, string>>;
  publicFields?: { twitchBroadcasterId?: string | null };
}): Promise<CredentialStatus> {
  assertValidProvider(input.provider);
  for (const key of Object.keys(input.secrets)) {
    assertValidKey(key);
  }

  await prisma.$transaction(async (tx) => {
    // 1. Upsert the credential row with public fields. We start with
    //    isEnabled = false and recompute at the end so the read-back
    //    inside the transaction is consistent with the writes. The
    //    upsert returns the row's ID; we reuse it for the per-secret
    //    upserts so we don't have to re-look it up inside the loop.
    const credential = await tx.integrationCredential.upsert({
      where: {
        channelId_provider: {
          channelId: input.channelId,
          provider: input.provider
        }
      },
      create: {
        channelId: input.channelId,
        provider: input.provider,
        isEnabled: false,
        twitchBroadcasterId: input.publicFields?.twitchBroadcasterId ?? null
      },
      update: {
        // Public-field update (only the fields the caller actually
        // passed in). We never blank twitchBroadcasterId unless the
        // caller explicitly passes `null`.
        ...(input.publicFields && "twitchBroadcasterId" in input.publicFields
          ? { twitchBroadcasterId: input.publicFields.twitchBroadcasterId ?? null }
          : {}),
        isEnabled: false
      },
      select: { id: true }
    });

    // 2. For each (key, value) in `secrets`, encrypt + upsert the
    //    secret row. Empty string is a sentinel: it clears the row
    //    without actually encrypting anything.
    for (const [key, value] of Object.entries(input.secrets)) {
      const ciphertext = value === "" ? "" : encryptSecret(value);
      await tx.integrationCredentialSecret.upsert({
        where: {
          credentialId_key: {
            credentialId: credential.id,
            key
          }
        },
        create: {
          credentialId: credential.id,
          key,
          ciphertext
        },
        update: { ciphertext }
      });
    }

    // 3. Read back the credential row (with all its secrets) and
    //    decide whether isEnabled should flip. isEnabled is true iff
    //    every REQUIRED_KEYS_BY_PROVIDER[provider] has a non-empty
    //    ciphertext.
    const fresh = await tx.integrationCredential.findUnique({
      where: {
        channelId_provider: {
          channelId: input.channelId,
          provider: input.provider
        }
      },
      include: { secrets: true }
    });
    if (!fresh) {
      // Should be impossible — we just upserted. Treat as an error
      // and let the transaction roll back.
      throw new Error(
        `saveChannelCredentials: credential row vanished mid-transaction for channelId=${input.channelId}`
      );
    }

    const presentKeys = new Set(
      fresh.secrets.filter((s) => s.ciphertext !== "").map((s) => s.key)
    );
    const required = REQUIRED_KEYS_BY_PROVIDER[input.provider];
    const shouldBeEnabled = required.every((k) => presentKeys.has(k));

    if (shouldBeEnabled !== fresh.isEnabled) {
      await tx.integrationCredential.update({
        where: { id: fresh.id },
        data: { isEnabled: shouldBeEnabled }
      });
    }
  });

  return getChannelCredentialStatus(input.channelId, input.provider);
}

/**
 * Clear a single secret for a (channelId, provider, key) tuple. Sets
 * ciphertext to "". Leaves the credential row in place (isEnabled will
 * be re-evaluated on next save).
 */
export async function clearChannelSecret(input: {
  channelId: string;
  provider: IntegrationProvider;
  key: IntegrationCredentialKey;
}): Promise<void> {
  assertValidProvider(input.provider);
  assertValidKey(input.key);

  await prisma.$transaction(async (tx) => {
    const credential = await tx.integrationCredential.findFirst({
      where: { channelId: input.channelId, provider: input.provider },
      select: { id: true }
    });
    if (!credential) {
      // Nothing to clear. Treat as a no-op rather than an error — the
      // UI may have a stale "configured" flag the user is trying to
      // clear after the row was already deleted.
      return;
    }

    // Use updateMany + count === 0 short-circuit: if the secret row
    // doesn't exist (e.g. user clicks "clear" on a key that was never
    // saved), we want this to be a no-op. Prisma's `update` throws
    // P2025 when the target row is missing and would roll back the
    // transaction. Matches the `clearAllChannelSecrets` pattern below.
    const clearResult = await tx.integrationCredentialSecret.updateMany({
      where: { credentialId: credential.id, key: input.key },
      data: { ciphertext: "" }
    });
    if (clearResult.count === 0) {
      // No matching secret row to clear. Nothing else to do.
      return;
    }

    // Re-evaluate isEnabled: clearing a required key always drops
    // isEnabled to false. Setting isEnabled to true again requires
    // a subsequent save with a non-empty value.
    await tx.integrationCredential.update({
      where: { id: credential.id },
      data: { isEnabled: false }
    });
  });
}

/**
 * Clear ALL secrets for a (channelId, provider) tuple. Keeps the
 * credential row. Returns void.
 */
export async function clearAllChannelSecrets(input: {
  channelId: string;
  provider: IntegrationProvider;
}): Promise<void> {
  assertValidProvider(input.provider);

  await prisma.$transaction(async (tx) => {
    const credential = await tx.integrationCredential.findFirst({
      where: { channelId: input.channelId, provider: input.provider },
      select: { id: true }
    });
    if (!credential) {
      // No row, no secrets — nothing to do.
      return;
    }

    await tx.integrationCredentialSecret.deleteMany({
      where: { credentialId: credential.id }
    });

    await tx.integrationCredential.update({
      where: { id: credential.id },
      data: { isEnabled: false }
    });
  });
}
