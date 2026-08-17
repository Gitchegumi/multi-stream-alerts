/**
 * Twitch EventSub auto-provisioning (issue #128).
 *
 * When a user connects their Twitch account via OAuth, the backend
 * provisions the EventSub subscriptions on their behalf instead of asking
 * them to paste an EventSub secret, Client ID, Client Secret, or broadcaster
 * ID into the UI. This module:
 *
 *  - mints an app access token (client-credentials) from the instance-level
 *    `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`,
 *  - generates a per-channel EventSub secret and stores it via the existing
 *    credential store (so the ingress HMAC match-loop keeps working
 *    unchanged — see `getAllTwitchEventSubSecrets`),
 *  - creates one webhook EventSub subscription per supported alert type,
 *    pointed at the global ingress callback, and records each subscription
 *    id in `ProviderSubscription` for later teardown.
 *
 * Every external call goes through an injectable `fetchFn` and the DB writes
 * through injectable helpers so the whole flow is unit-testable under
 * `node:test` without touching Twitch or Postgres.
 *
 * Secret handling: the generated EventSub secret is only ever passed to the
 * Twitch transport and to `saveChannelCredentials` (which encrypts it at
 * rest). It is never logged.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '../client';
import {
  saveChannelCredentials,
  clearAllChannelSecrets,
  getChannelDecryptedSecret,
} from '../integration-credentials';

const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_EVENTSUB_URL = 'https://api.twitch.tv/helix/eventsub/subscriptions';

/**
 * The EventSub subscription types we provision, matched to the alert types
 * the normalizer in `apps/ingress/src/twitch.ts` understands. `condition`
 * is built from the broadcaster's numeric user id. `channel.hypechat` from
 * the normalizer has no corresponding EventSub subscription type, so it is
 * intentionally omitted here.
 *
 * The `scope` column documents the OAuth scope the broadcaster must have
 * granted for Twitch to accept the subscription; those scopes are requested
 * in `apps/web/src/lib/auth.ts`. Subscriptions whose scope was not granted
 * fail individually and are logged without aborting the rest.
 */
export const SUPPORTED_TWITCH_SUBSCRIPTIONS: ReadonlyArray<{
  type: string;
  version: string;
  scope: string | null;
  condition: (broadcasterId: string) => Record<string, string>;
}> = [
  {
    type: 'channel.follow',
    version: '2',
    scope: 'moderator:read:followers',
    // v2 requires a moderator id; the broadcaster is a moderator of their
    // own channel, so we reuse the broadcaster id.
    condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }),
  },
  {
    type: 'channel.subscribe',
    version: '1',
    scope: 'channel:read:subscriptions',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.subscription.gift',
    version: '1',
    scope: 'channel:read:subscriptions',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.cheer',
    version: '1',
    scope: 'bits:read',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.raid',
    version: '1',
    scope: null,
    // A raid event fires on the channel being raided.
    condition: (id) => ({ to_broadcaster_user_id: id }),
  },
  {
    type: 'channel.charity_campaign.donate',
    version: '1',
    scope: 'channel:read:charity',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
  {
    type: 'channel.channel_points_custom_reward_redemption.add',
    version: '1',
    scope: 'channel:read:redemptions',
    condition: (id) => ({ broadcaster_user_id: id }),
  },
];

// ---------------------------------------------------------------------------
// Dependency-injection seams
// ---------------------------------------------------------------------------

export interface TwitchProvisionDeps {
  /** HTTP client. Defaults to global fetch. */
  fetchFn?: typeof fetch;
  /** Generate the per-channel EventSub secret. Defaults to 32 random bytes hex. */
  generateSecret?: () => string;
  /** App access-token minting. Defaults to the client-credentials flow. */
  getAppToken?: (deps: TwitchProvisionDeps) => Promise<string>;
  /** Persist the generated secret + broadcaster id. Defaults to saveChannelCredentials. */
  saveCredentials?: typeof saveChannelCredentials;
  /** Read the workspace's existing shared EventSub secret. */
  getEventSubSecret?: (channelId: string) => Promise<string | null>;
  /** Clear all Twitch secrets on full disconnect. Defaults to clearAllChannelSecrets. */
  clearCredentials?: (input: { channelId: string; provider: 'twitch' }) => Promise<void>;
  /** Record a created subscription id. Defaults to a ProviderSubscription upsert. */
  recordSubscription?: (input: {
    channelId: string;
    providerAccountId: string;
    providerSubscriptionId: string;
    type: string;
  }) => Promise<void>;
  /** List tracked subscription ids for teardown. Defaults to a ProviderSubscription query. */
  listSubscriptions?: (
    channelId: string,
    providerAccountId?: string,
  ) => Promise<Array<{ providerSubscriptionId: string }>>;
  /** Delete tracked subscription rows. Defaults to a ProviderSubscription deleteMany. */
  deleteSubscriptionRecords?: (channelId: string, providerAccountId?: string) => Promise<void>;
  /** Environment (for client id/secret + callback base). Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

function resolve(deps: TwitchProvisionDeps): Required<Omit<TwitchProvisionDeps, 'env'>> & {
  env: NodeJS.ProcessEnv;
} {
  const env = deps.env ?? process.env;
  return {
    fetchFn: deps.fetchFn ?? fetch,
    generateSecret: deps.generateSecret ?? (() => randomBytes(32).toString('hex')),
    getAppToken: deps.getAppToken ?? getTwitchAppAccessToken,
    saveCredentials: deps.saveCredentials ?? saveChannelCredentials,
    getEventSubSecret:
      deps.getEventSubSecret ??
      ((channelId) =>
        getChannelDecryptedSecret({
          channelId,
          provider: 'twitch',
          key: 'twitch.eventsub_secret',
        })),
    clearCredentials:
      deps.clearCredentials ??
      ((input) => clearAllChannelSecrets({ channelId: input.channelId, provider: input.provider })),
    recordSubscription: deps.recordSubscription ?? defaultRecordSubscription,
    listSubscriptions: deps.listSubscriptions ?? defaultListSubscriptions,
    deleteSubscriptionRecords: deps.deleteSubscriptionRecords ?? defaultDeleteSubscriptionRecords,
    env,
  };
}

async function defaultRecordSubscription(input: {
  channelId: string;
  providerAccountId: string;
  providerSubscriptionId: string;
  type: string;
}): Promise<void> {
  await prisma.providerSubscription.upsert({
    where: { providerSubscriptionId: input.providerSubscriptionId },
    create: {
      channelId: input.channelId,
      provider: 'twitch',
      providerAccountId: input.providerAccountId,
      providerSubscriptionId: input.providerSubscriptionId,
      type: input.type,
      status: 'enabled',
    },
    update: {
      status: 'enabled',
      type: input.type,
      providerAccountId: input.providerAccountId,
    },
  });
}

async function defaultListSubscriptions(
  channelId: string,
  providerAccountId?: string,
): Promise<Array<{ providerSubscriptionId: string }>> {
  return prisma.providerSubscription.findMany({
    where: { channelId, provider: 'twitch', ...(providerAccountId && { providerAccountId }) },
    select: { providerSubscriptionId: true },
  });
}

async function defaultDeleteSubscriptionRecords(
  channelId: string,
  providerAccountId?: string,
): Promise<void> {
  await prisma.providerSubscription.deleteMany({
    where: { channelId, provider: 'twitch', ...(providerAccountId && { providerAccountId }) },
  });
}

// ---------------------------------------------------------------------------
// App access token (client-credentials), cached in-memory
// ---------------------------------------------------------------------------

let cachedAppToken: { token: string; expiresAt: number } | null = null;

/** Testing hook: drop the in-memory app-token cache. */
export function __resetTwitchAppTokenCacheForTesting(): void {
  cachedAppToken = null;
}

/**
 * Mint (and cache) an app access token via the client-credentials grant.
 * Refreshes a minute before expiry. Throws if the instance-level Twitch
 * app credentials are missing or Twitch rejects the request.
 */
export async function getTwitchAppAccessToken(deps: TwitchProvisionDeps = {}): Promise<string> {
  const env = deps.env ?? process.env;
  const fetchFn = deps.fetchFn ?? fetch;

  const now = Date.now();
  if (cachedAppToken && cachedAppToken.expiresAt > now + 60_000) {
    return cachedAppToken.token;
  }

  const clientId = env.TWITCH_CLIENT_ID;
  const clientSecret = env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('Twitch app credentials are not configured (TWITCH_CLIENT_ID/SECRET)');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  const res = await fetchFn(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    throw new Error(`Twitch app token request failed: ${res.status}`);
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error('Twitch app token response missing access_token');
  }
  cachedAppToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedAppToken.token;
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

export interface TwitchProvisionResult {
  created: string[];
  failed: Array<{ type: string; reason: string }>;
}

/**
 * Provision Twitch EventSub for a broadcaster in a workspace. The first
 * linked broadcaster creates the workspace's shared webhook secret. Further
 * broadcasters reuse that secret and append subscriptions, preserving alerts
 * for channels that are already linked. Individual subscription failures
 * (including Twitch's conflict response for an existing subscription) are
 * collected and returned without aborting the remaining types.
 */
export async function provisionTwitchEventSub(
  input: { channelId: string; broadcasterUserId: string },
  deps: TwitchProvisionDeps = {},
): Promise<TwitchProvisionResult> {
  const d = resolve(deps);

  const callback = buildCallbackUrl(d.env);
  const token = await d.getAppToken(deps);
  const clientId = d.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new Error('Twitch app credentials are not configured (TWITCH_CLIENT_ID)');
  }

  let secret = await d.getEventSubSecret(input.channelId);
  if (!secret) {
    // Clean up any orphaned tracked subscriptions before creating the first
    // subscription set with a fresh shared secret.
    await removeRemoteSubscriptions(input.channelId, token, clientId, d);
    secret = d.generateSecret();
    await d.saveCredentials({
      channelId: input.channelId,
      provider: 'twitch',
      secrets: { 'twitch.eventsub_secret': secret },
      publicFields: { twitchBroadcasterId: input.broadcasterUserId },
    });
  }

  const result: TwitchProvisionResult = { created: [], failed: [] };

  for (const sub of SUPPORTED_TWITCH_SUBSCRIPTIONS) {
    try {
      const res = await d.fetchFn(TWITCH_EVENTSUB_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Client-Id': clientId,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: sub.type,
          version: sub.version,
          condition: sub.condition(input.broadcasterUserId),
          transport: { method: 'webhook', callback, secret },
        }),
      });

      if (res.status === 202 || res.ok) {
        const json = (await res.json().catch(() => null)) as {
          data?: Array<{ id?: string }>;
        } | null;
        const id = json?.data?.[0]?.id;
        if (id) {
          await d.recordSubscription({
            channelId: input.channelId,
            providerAccountId: input.broadcasterUserId,
            providerSubscriptionId: id,
            type: sub.type,
          });
        }
        result.created.push(sub.type);
      } else {
        result.failed.push({ type: sub.type, reason: `http_${res.status}` });
      }
    } catch (err) {
      result.failed.push({ type: sub.type, reason: errorReason(err) });
    }
  }

  console.info('twitch eventsub provisioned', {
    channelId: input.channelId,
    created: result.created.length,
    failed: result.failed.length,
  });

  return result;
}

/**
 * Tear down all Twitch EventSub subscriptions for a channel and clear its
 * stored EventSub secret + broadcaster id. Remote deletion is fail-closed:
 * credentials and local tracking remain intact when Twitch rejects a delete
 * so the operation can be retried without rotating the shared secret.
 */
export async function teardownTwitchEventSub(
  input: { channelId: string },
  deps: TwitchProvisionDeps = {},
): Promise<void> {
  const d = resolve(deps);
  const clientId = d.env.TWITCH_CLIENT_ID;

  if (!clientId) {
    throw new Error('Twitch app credentials are not configured (TWITCH_CLIENT_ID)');
  }

  const token = await d.getAppToken(deps);
  await removeRemoteSubscriptions(input.channelId, token, clientId, d);
  await d.clearCredentials({ channelId: input.channelId, provider: 'twitch' });
}

/**
 * Remove only one broadcaster's EventSub subscriptions. The workspace secret
 * is deliberately preserved because every linked broadcaster shares it.
 */
export async function teardownTwitchBroadcasterEventSub(
  input: { channelId: string; broadcasterUserId: string },
  deps: TwitchProvisionDeps = {},
): Promise<void> {
  const d = resolve(deps);
  const clientId = d.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    throw new Error('Twitch app credentials are not configured (TWITCH_CLIENT_ID)');
  }

  const token = await d.getAppToken(deps);
  await removeRemoteSubscriptions(input.channelId, token, clientId, d, input.broadcasterUserId);
}

/**
 * Delete every tracked Twitch subscription from Twitch and drop the local
 * tracking rows. Shared by provision (rotation) and teardown (disconnect).
 */
async function removeRemoteSubscriptions(
  channelId: string,
  token: string,
  clientId: string,
  d: ReturnType<typeof resolve>,
  providerAccountId?: string,
): Promise<void> {
  const existing = await d.listSubscriptions(channelId, providerAccountId);
  const failures: string[] = [];
  for (const sub of existing) {
    try {
      const response = await d.fetchFn(
        `${TWITCH_EVENTSUB_URL}?id=${encodeURIComponent(sub.providerSubscriptionId)}`,
        {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Client-Id': clientId },
        },
      );
      // A prior partial attempt may already have removed this subscription.
      if (!response.ok && response.status !== 404) {
        failures.push(`http_${response.status}`);
      }
    } catch (err) {
      failures.push(errorReason(err));
    }
  }

  if (failures.length > 0) {
    throw new Error(`Twitch rejected ${failures.length} EventSub deletion(s)`);
  }

  await d.deleteSubscriptionRecords(channelId, providerAccountId);
}

function buildCallbackUrl(env: NodeJS.ProcessEnv): string {
  const base = stripTrailingSlashes(env.INGRESS_PUBLIC_BASE_URL ?? env.PUBLIC_BASE_URL ?? '');
  if (!base) {
    throw new Error(
      'INGRESS_PUBLIC_BASE_URL (or PUBLIC_BASE_URL) is not set for the webhook callback',
    );
  }
  return `${base}/api/webhooks/twitch`;
}

/**
 * Trim trailing slashes with a linear scan instead of a `/\/+$/` regex, whose
 * ambiguous quantifier trips ReDoS scanners on env-provided input.
 */
function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47 /* '/' */) end -= 1;
  return value.slice(0, end);
}

function errorReason(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown_error';
}
