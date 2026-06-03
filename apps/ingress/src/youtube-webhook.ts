import type { Request, NextFunction } from 'express';
import {
  getChannelDecryptedSecret,
  claimDeduplicationKey,
  storeAndPublishAlertEvent,
} from '@multi-stream-alerts/database';
import { prisma } from '@multi-stream-alerts/database';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import { normalizeYoutubePubSub } from './youtube';

/**
 * Structural shape for the Express `Response` that the handler uses.
 * The handler only ever calls `response.status(code).json(body)`, so
 * declaring a narrow interface here keeps the handler decoupled from
 * the full Express `Response` type and makes it trivial to stub in
 * unit tests.
 */
interface YoutubeWebhookResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

export type YoutubeRejectionReason = 'channel_not_found' | 'not_configured';

/**
 * Dependency-injection seam for tests. Each field is optional; defaults
 * pull from the live database / normalizer. Tests pass in a stub `deps`
 * object to avoid touching a real Prisma client or Redis.
 *
 * - `findChannelBySlug` resolves the channel from the URL slug.
 * - `getDecryptedClientId` / `getDecryptedClientSecret` load the
 *   channel's stored YouTube OAuth credentials.
 * - `normalizeEvent` parses the Atom XML body into an internal alert event.
 * - `claimDedup` deduplicates by raw event id.
 * - `storeAndPublish` persists the event and pushes it to Redis.
 */
export interface YoutubeWebhookDeps {
  findChannelBySlug?: (slug: string) => Promise<{ id: string; slug: string } | null>;
  getDecryptedClientId?: (channelId: string) => Promise<string | null>;
  getDecryptedClientSecret?: (channelId: string) => Promise<string | null>;
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
  getDecryptedClientId: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: 'youtube',
      key: 'youtube.client_id',
    }),
  getDecryptedClientSecret: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: 'youtube',
      key: 'youtube.client_secret',
    }),
  normalizeEvent: normalizeYoutubePubSub,
  claimDedup: claimDeduplicationKey,
  storeAndPublish: storeAndPublishAlertEvent,
};

/**
 * Express handler for the path-based YouTube Pub/Sub hub callback:
 *   POST /api/webhooks/youtube/:channelSlug
 *
 * Resolves the channel from the URL slug, loads its stored
 * YouTube OAuth client_id / client_secret (encrypted at rest),
 * parses the inbound Atom XML, normalizes it to an internal alert
 * event, deduplicates by `rawEventId`, and stores + publishes the event.
 *
 * Never logs the client_id or client_secret value. The only
 * identifiers it emits are `channelSlug`, `channelId`, `rawEventId`,
 * and the opaque rejection reason.
 */
export async function handleYoutubeWebhook(
  request: Pick<Request, 'params' | 'body'>,
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
  const getClientId = resolved.getDecryptedClientId;
  const getClientSecret = resolved.getDecryptedClientSecret;
  const normalizeEvent = resolved.normalizeEvent;
  const claimKey = resolved.claimDedup;
  const publish = resolved.storeAndPublish;

  const channel = await findChannel(channelSlug);
  if (!channel) {
    console.warn('youtube webhook rejected', { channelSlug, reason: 'channel_not_found' });
    response.status(404).json({ error: 'Channel not found' });
    return;
  }

  // Load both credentials up front. Either being null means the channel
  // is not fully configured for YouTube ingestion.
  const [clientId, clientSecret] = await Promise.all([
    getClientId(channel.id),
    getClientSecret(channel.id),
  ]);

  if (!clientId || !clientSecret) {
    console.warn('youtube webhook rejected', { channelSlug, reason: 'not_configured' });
    response.status(503).json({ error: 'YouTube not configured for this channel' });
    return;
  }

  console.info('youtube webhook accepted', { channelSlug, channelId: channel.id });

  // The server.ts route uses express.raw({ type: '*/*' }) so body is a
  // Buffer. If tests inject a string we accept that too.
  const rawBody = Buffer.isBuffer(request.body)
    ? request.body.toString('utf8')
    : typeof request.body === 'string'
      ? request.body
      : '';

  const normalized = normalizeEvent(rawBody);

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

/**
 * Express handler that delegates to `handleYoutubeWebhook` with the
 * live defaults. The dep-injection point is the unit-test entry;
 * this wrapper exists so `server.ts` can register it as a normal
 * Express handler (which requires the `(req, res, next)` shape).
 */
export async function youtubeWebhookExpressHandler(
  request: Request,
  response: YoutubeWebhookResponse,
  _next: NextFunction,
): Promise<void> {
  await handleYoutubeWebhook(request, response);
}
