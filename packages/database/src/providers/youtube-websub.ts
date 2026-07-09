/**
 * YouTube WebSub (PubSubHubbub) auto-provisioning (issue #128).
 *
 * When a user connects their YouTube account via OAuth, the backend resolves
 * their channel id from the granted `youtube.readonly` token and subscribes
 * to that channel's upload feed on Google's public WebSub hub, pointing the
 * hub at the per-channel ingress callback. Instead of asking the user to
 * paste a Client ID / Client Secret, we:
 *
 *  - resolve the YouTube channel id via the Data API,
 *  - generate a per-channel WebSub secret and store it (the ingress uses it
 *    to verify inbound notification HMACs),
 *  - POST a `hub.mode=subscribe` request to the hub, and record the topic in
 *    `ProviderSubscription` with the lease expiry so the worker can renew it.
 *
 * WebSub leases expire (Google grants ~5 days), so `provisionYoutubeWebSub`
 * is safe to call repeatedly — the worker calls it to renew.
 *
 * All external calls go through an injectable `fetchFn`, and DB writes
 * through injectable helpers, so the flow is unit-testable under `node:test`.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '../client';
import { saveChannelCredentials, clearAllChannelSecrets } from '../integration-credentials';

const YOUTUBE_HUB_URL = 'https://pubsubhubbub.appspot.com/subscribe';
const YOUTUBE_DATA_CHANNELS_URL =
  'https://www.googleapis.com/youtube/v3/channels?part=id&mine=true';
const YOUTUBE_TOPIC_BASE = 'https://www.youtube.com/xml/feeds/videos.xml?channel_id=';

/** Default WebSub lease we request, in seconds (Google caps this). */
const DEFAULT_LEASE_SECONDS = 432000; // 5 days

// ---------------------------------------------------------------------------
// Dependency-injection seams
// ---------------------------------------------------------------------------

export interface YoutubeProvisionDeps {
  fetchFn?: typeof fetch;
  generateSecret?: () => string;
  /** Persist the generated secret + channel id. Defaults to saveChannelCredentials. */
  saveCredentials?: typeof saveChannelCredentials;
  clearCredentials?: (input: { channelId: string; provider: 'youtube' }) => Promise<void>;
  recordSubscription?: (input: {
    channelId: string;
    topic: string;
    expiresAt: Date;
  }) => Promise<void>;
  listSubscriptions?: (channelId: string) => Promise<Array<{ providerSubscriptionId: string }>>;
  deleteSubscriptionRecords?: (channelId: string) => Promise<void>;
  env?: NodeJS.ProcessEnv;
  /** Lease length in seconds to request. Defaults to DEFAULT_LEASE_SECONDS. */
  leaseSeconds?: number;
  now?: () => number;
}

function resolve(deps: YoutubeProvisionDeps) {
  const env = deps.env ?? process.env;
  return {
    fetchFn: deps.fetchFn ?? fetch,
    generateSecret: deps.generateSecret ?? (() => randomBytes(32).toString('hex')),
    saveCredentials: deps.saveCredentials ?? saveChannelCredentials,
    clearCredentials:
      deps.clearCredentials ??
      ((input: { channelId: string; provider: 'youtube' }) =>
        clearAllChannelSecrets({ channelId: input.channelId, provider: input.provider })),
    recordSubscription: deps.recordSubscription ?? defaultRecordSubscription,
    listSubscriptions: deps.listSubscriptions ?? defaultListSubscriptions,
    deleteSubscriptionRecords: deps.deleteSubscriptionRecords ?? defaultDeleteSubscriptionRecords,
    env,
    leaseSeconds: deps.leaseSeconds ?? DEFAULT_LEASE_SECONDS,
    now: deps.now ?? Date.now,
  };
}

async function defaultRecordSubscription(input: {
  channelId: string;
  topic: string;
  expiresAt: Date;
}): Promise<void> {
  await prisma.providerSubscription.upsert({
    where: { providerSubscriptionId: input.topic },
    create: {
      channelId: input.channelId,
      provider: 'youtube',
      providerSubscriptionId: input.topic,
      type: 'websub',
      status: 'enabled',
      expiresAt: input.expiresAt,
    },
    update: { status: 'enabled', expiresAt: input.expiresAt },
  });
}

async function defaultListSubscriptions(
  channelId: string,
): Promise<Array<{ providerSubscriptionId: string }>> {
  return prisma.providerSubscription.findMany({
    where: { channelId, provider: 'youtube' },
    select: { providerSubscriptionId: true },
  });
}

async function defaultDeleteSubscriptionRecords(channelId: string): Promise<void> {
  await prisma.providerSubscription.deleteMany({ where: { channelId, provider: 'youtube' } });
}

// ---------------------------------------------------------------------------
// Channel-id resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the caller's YouTube channel id (UC…) from an OAuth access token
 * carrying the `youtube.readonly` scope. Returns null if the account has no
 * channel or the API call fails.
 */
export async function resolveYoutubeChannelId(
  accessToken: string,
  deps: YoutubeProvisionDeps = {},
): Promise<string | null> {
  const fetchFn = deps.fetchFn ?? fetch;
  try {
    const res = await fetchFn(YOUTUBE_DATA_CHANNELS_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { items?: Array<{ id?: string }> };
    return json.items?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provisioning
// ---------------------------------------------------------------------------

export interface YoutubeProvisionResult {
  ok: boolean;
  topic: string;
  reason?: string;
}

/**
 * Subscribe (or renew) the channel's YouTube upload feed on the WebSub hub.
 * Writes the WebSub secret + `youtubeChannelId` public field and records the
 * lease expiry. Safe to call repeatedly for renewal — the hub treats a
 * repeat subscribe as a lease extension and we upsert our tracking row.
 */
export async function provisionYoutubeWebSub(
  input: { channelId: string; channelSlug: string; youtubeChannelId: string },
  deps: YoutubeProvisionDeps = {},
): Promise<YoutubeProvisionResult> {
  const d = resolve(deps);
  const callback = buildCallbackUrl(d.env, input.channelSlug);
  const topic = `${YOUTUBE_TOPIC_BASE}${encodeURIComponent(input.youtubeChannelId)}`;

  const secret = d.generateSecret();
  await d.saveCredentials({
    channelId: input.channelId,
    provider: 'youtube',
    secrets: { 'youtube.websub_secret': secret },
    publicFields: { youtubeChannelId: input.youtubeChannelId },
  });

  const body = new URLSearchParams({
    'hub.mode': 'subscribe',
    'hub.topic': topic,
    'hub.callback': callback,
    'hub.verify': 'async',
    'hub.secret': secret,
    'hub.lease_seconds': String(d.leaseSeconds),
  });

  try {
    const res = await d.fetchFn(YOUTUBE_HUB_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    // The hub replies 202 Accepted and then verifies asynchronously via a
    // GET to our callback.
    if (res.status === 202 || res.ok) {
      const expiresAt = new Date(d.now() + d.leaseSeconds * 1000);
      await d.recordSubscription({ channelId: input.channelId, topic, expiresAt });
      console.info('youtube websub provisioned', { channelId: input.channelId });
      return { ok: true, topic };
    }
    console.warn('youtube websub subscribe failed', {
      channelId: input.channelId,
      status: res.status,
    });
    return { ok: false, topic, reason: `http_${res.status}` };
  } catch (err) {
    const reason = err instanceof Error ? err.message : 'unknown_error';
    console.warn('youtube websub subscribe error', { channelId: input.channelId, reason });
    return { ok: false, topic, reason };
  }
}

/**
 * Unsubscribe the channel's WebSub feed and clear its stored YouTube secret +
 * channel id. Called on disconnect. Best-effort on the remote unsubscribe;
 * always clears local state.
 */
export async function teardownYoutubeWebSub(
  input: { channelId: string; channelSlug: string },
  deps: YoutubeProvisionDeps = {},
): Promise<void> {
  const d = resolve(deps);
  const callback = buildCallbackUrl(d.env, input.channelSlug);
  const existing = await d.listSubscriptions(input.channelId);

  for (const sub of existing) {
    try {
      const body = new URLSearchParams({
        'hub.mode': 'unsubscribe',
        'hub.topic': sub.providerSubscriptionId,
        'hub.callback': callback,
        'hub.verify': 'async',
      });
      await d.fetchFn(YOUTUBE_HUB_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err) {
      console.warn('youtube websub: failed to unsubscribe', {
        channelId: input.channelId,
        reason: err instanceof Error ? err.message : 'unknown_error',
      });
    }
  }

  await d.deleteSubscriptionRecords(input.channelId);
  await d.clearCredentials({ channelId: input.channelId, provider: 'youtube' });
}

// ---------------------------------------------------------------------------
// Renewal (used by the worker)
// ---------------------------------------------------------------------------

/**
 * Find YouTube WebSub subscriptions whose lease expires within `withinMs`
 * and return the channel context needed to re-subscribe. The worker calls
 * `provisionYoutubeWebSub` for each.
 */
export async function findExpiringYoutubeSubscriptions(
  withinMs: number,
  now: () => number = Date.now,
): Promise<Array<{ channelId: string; channelSlug: string; youtubeChannelId: string }>> {
  const cutoff = new Date(now() + withinMs);
  const rows = await prisma.providerSubscription.findMany({
    where: { provider: 'youtube', expiresAt: { lte: cutoff } },
    select: {
      channelId: true,
      channel: { select: { slug: true } },
    },
  });

  const out: Array<{ channelId: string; channelSlug: string; youtubeChannelId: string }> = [];
  for (const row of rows) {
    // The channel id lives on the credential row's public field.
    const cred = await prisma.integrationCredential.findFirst({
      where: { channelId: row.channelId, provider: 'youtube' },
      select: { youtubeChannelId: true },
    });
    if (cred?.youtubeChannelId) {
      out.push({
        channelId: row.channelId,
        channelSlug: row.channel.slug,
        youtubeChannelId: cred.youtubeChannelId,
      });
    }
  }
  return out;
}

function buildCallbackUrl(env: NodeJS.ProcessEnv, channelSlug: string): string {
  const base = (env.INGRESS_PUBLIC_BASE_URL ?? env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      'INGRESS_PUBLIC_BASE_URL (or PUBLIC_BASE_URL) is not set for the webhook callback',
    );
  }
  return `${base}/api/webhooks/youtube/${encodeURIComponent(channelSlug)}`;
}
