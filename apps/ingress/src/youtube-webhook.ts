import type { Request, NextFunction } from 'express';
import {
  getChannelDecryptedSecret,
  claimDeduplicationKey,
  storeAndPublishAlertEvent,
} from '@multi-stream-alerts/database';
import { prisma } from '@multi-stream-alerts/database';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import { normalizeYoutubePubSub, verifyYoutubeWebSubSignature } from './youtube';

/**
 * Structural shape for the Express `Response` that the handlers use. The
 * notification handler only ever calls `response.status(code).json(body)`;
 * the WebSub verification (GET) handler additionally needs `.send(text)` to
 * echo the `hub.challenge`.
 */
interface YoutubeWebhookResponse {
  status: (code: number) => { json: (body: unknown) => void; send?: (body: string) => void };
}

interface YoutubeVerificationResponse {
  setHeader: (name: string, value: string) => void;
  status: (code: number) => { send: (body: string) => void; json: (body: unknown) => void };
}

/**
 * WebSub `hub.challenge` tokens are opaque, url-safe strings the hub picks.
 * Bound length and character set so we never reflect an arbitrary payload
 * back to a caller (defense in depth alongside the text/plain content type).
 */
const HUB_CHALLENGE_PATTERN = /^[\w.\-~=+/]{1,256}$/;

export type YoutubeRejectionReason = 'channel_not_found' | 'not_configured' | 'invalid_signature';

/**
 * Dependency-injection seam for the notification handler.
 *
 * Since issue #128 the ingest gate is "has this channel been OAuth-provisioned
 * for YouTube?" — i.e. does it have a stored `youtube.websub_secret` — rather
 * than the old manual client_id/client_secret pair. When the secret is
 * present we also verify the WebSub HMAC on the raw body.
 */
export interface YoutubeWebhookDeps {
  findChannelBySlug?: (slug: string) => Promise<{ id: string; slug: string } | null>;
  /** Load the channel's WebSub secret (null = not provisioned). */
  getWebSubSecret?: (channelId: string) => Promise<string | null>;
  verifySignature?: typeof verifyYoutubeWebSubSignature;
  normalizeEvent?: typeof normalizeYoutubePubSub;
  claimDedup?: (input: {
    provider: string;
    rawEventId: string;
    channelId: string;
  }) => Promise<boolean>;
  storeAndPublish?: typeof storeAndPublishAlertEvent;
}

const defaultDeps: Required<YoutubeWebhookDeps> = {
  findChannelBySlug: async (slug) => {
    const channel = await prisma.channel.findUnique({ where: { slug } });
    return channel ? { id: channel.id, slug: channel.slug } : null;
  },
  getWebSubSecret: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: 'youtube',
      key: 'youtube.websub_secret',
    }),
  verifySignature: verifyYoutubeWebSubSignature,
  normalizeEvent: normalizeYoutubePubSub,
  claimDedup: claimDeduplicationKey,
  storeAndPublish: storeAndPublishAlertEvent,
};

/**
 * Express handler for the path-based YouTube WebSub hub callback (POST):
 *   POST /api/webhooks/youtube/:channelSlug
 *
 * Resolves the channel from the URL slug, loads its stored WebSub secret
 * (present only after the user connected YouTube via OAuth), verifies the
 * inbound `X-Hub-Signature` HMAC, parses the Atom XML, normalizes it to an
 * internal alert event, deduplicates by `rawEventId`, and stores + publishes.
 *
 * Never logs the secret. The only identifiers it emits are `channelSlug`,
 * `channelId`, `rawEventId`, and the opaque rejection reason.
 */
export async function handleYoutubeWebhook(
  request: Pick<Request, 'params' | 'body' | 'headers'>,
  response: YoutubeWebhookResponse,
  deps: YoutubeWebhookDeps = {},
): Promise<void> {
  const channelSlug = request.params.channelSlug;
  if (typeof channelSlug !== 'string' || channelSlug.length === 0) {
    response.status(400).json({ error: 'Missing channelSlug' });
    return;
  }

  const resolved: Required<YoutubeWebhookDeps> = { ...defaultDeps, ...deps };
  const findChannel = resolved.findChannelBySlug;
  const getSecret = resolved.getWebSubSecret;
  const verifySignature = resolved.verifySignature;
  const normalizeEvent = resolved.normalizeEvent;
  const claimKey = resolved.claimDedup;
  const publish = resolved.storeAndPublish;

  const channel = await findChannel(channelSlug);
  if (!channel) {
    console.warn('youtube webhook rejected', { channelSlug, reason: 'channel_not_found' });
    response.status(404).json({ error: 'Channel not found' });
    return;
  }

  const secret = await getSecret(channel.id);
  if (!secret) {
    console.warn('youtube webhook rejected', { channelSlug, reason: 'not_configured' });
    response.status(503).json({ error: 'YouTube not configured for this channel' });
    return;
  }

  // express.raw({ type: '*/*' }) delivers the body as a Buffer. Verify the
  // WebSub HMAC over the raw bytes before doing anything with the payload.
  const rawBody = Buffer.isBuffer(request.body)
    ? request.body
    : typeof request.body === 'string'
      ? Buffer.from(request.body)
      : Buffer.from('');

  const signature = headerString(request.headers?.['x-hub-signature']);
  if (!verifySignature({ secret, signature, rawBody })) {
    console.warn('youtube webhook rejected', { channelSlug, reason: 'invalid_signature' });
    response.status(401).json({ error: 'Invalid WebSub signature' });
    return;
  }

  console.info('youtube webhook accepted', { channelSlug, channelId: channel.id });

  const normalized = normalizeEvent(rawBody.toString('utf8'));
  if (normalized === null) {
    console.warn('youtube webhook suppressed', { channelSlug, reason: 'unmapped' });
    response.status(204).json({});
    return;
  }

  const fresh = await claimKey({
    provider: 'youtube',
    rawEventId: normalized.rawEventId,
    channelId: channel.id,
  });
  if (!fresh) {
    response.status(200).json({ ok: true, duplicate: true });
    return;
  }

  const event: AlertEvent | null = await publish({ ...normalized, channelId: channel.id });
  if (!event) {
    response.status(200).json({ ok: true, suppressed: true });
    return;
  }

  response.status(200).json({ ok: true, event });
}

// ---------------------------------------------------------------------------
// WebSub verification (GET) — hub intent confirmation
// ---------------------------------------------------------------------------

export interface YoutubeVerificationDeps {
  findChannelBySlug?: (slug: string) => Promise<{ id: string } | null>;
  /** Confirm we actually requested this topic for this channel. */
  hasSubscription?: (channelId: string, topic: string) => Promise<boolean>;
}

const defaultVerificationDeps: Required<YoutubeVerificationDeps> = {
  findChannelBySlug: async (slug) => {
    const channel = await prisma.channel.findUnique({ where: { slug } });
    return channel ? { id: channel.id } : null;
  },
  hasSubscription: async (channelId, topic) => {
    const row = await prisma.providerSubscription.findFirst({
      where: { channelId, provider: 'youtube', providerSubscriptionId: topic },
      select: { id: true },
    });
    return row !== null;
  },
};

/**
 * WebSub verification of intent (GET):
 *   GET /api/webhooks/youtube/:channelSlug?hub.mode=subscribe&hub.topic=…&hub.challenge=…
 *
 * The hub calls this to confirm we requested the (un)subscription. We echo
 * `hub.challenge` back as plain text only when the channel resolves and a
 * matching `ProviderSubscription` row exists, so we never confirm a
 * subscription we did not initiate.
 */
export async function handleYoutubeWebSubVerification(
  request: Pick<Request, 'params' | 'query'>,
  response: YoutubeVerificationResponse,
  deps: YoutubeVerificationDeps = {},
): Promise<void> {
  // Always respond as plain text: the body is echoed back to the caller, and
  // the Express default of text/html would make a reflected value executable.
  response.setHeader('Content-Type', 'text/plain; charset=utf-8');

  const channelSlug = queryString(request.params.channelSlug as string | string[] | undefined);
  const query = request.query as Record<string, string | string[] | undefined>;
  const mode = queryString(query['hub.mode']);
  const topic = queryString(query['hub.topic']);
  const challenge = queryString(query['hub.challenge']);

  if (!channelSlug || !mode || !topic || !challenge || !HUB_CHALLENGE_PATTERN.test(challenge)) {
    response.status(400).send('Missing WebSub verification parameters');
    return;
  }

  const resolved = { ...defaultVerificationDeps, ...deps };
  const channel = await resolved.findChannelBySlug(channelSlug);
  if (!channel) {
    console.warn('youtube websub verification rejected', {
      channelSlug,
      reason: 'channel_not_found',
    });
    response.status(404).send('Channel not found');
    return;
  }

  const known = await resolved.hasSubscription(channel.id, topic);
  if (!known) {
    console.warn('youtube websub verification rejected', {
      channelSlug,
      reason: 'unknown_topic',
    });
    response.status(404).send('Unknown subscription');
    return;
  }

  console.info('youtube websub verification confirmed', { channelSlug, mode });
  response.status(200).send(challenge);
}

/**
 * Express handler that delegates to `handleYoutubeWebhook` with the live
 * defaults. This wrapper exists so `server.ts` can register it as a normal
 * Express handler (which requires the `(req, res, next)` shape).
 */
export async function youtubeWebhookExpressHandler(
  request: Request,
  response: YoutubeWebhookResponse,
  _next: NextFunction,
): Promise<void> {
  await handleYoutubeWebhook(request, response);
}

/** Express handler for the WebSub verification GET. */
export async function youtubeWebSubVerificationExpressHandler(
  request: Request,
  response: YoutubeVerificationResponse,
  _next: NextFunction,
): Promise<void> {
  await handleYoutubeWebSubVerification(request, response);
}

function headerString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return undefined;
}

function queryString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}
