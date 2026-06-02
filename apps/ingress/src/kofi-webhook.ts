import type { Request, NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import {
  prisma,
  getChannelDecryptedSecret,
  claimDeduplicationKey,
  storeAndPublishAlertEvent,
} from '@multi-stream-alerts/database';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import { parseKofiFormData } from './kofi';

/**
 * Structural shape for the Express `Response` that the handler uses.
 * The handler only ever calls `response.status(code).json(body)`, so
 * declaring a narrow interface here keeps the handler decoupled from
 * the full Express `Response` type and makes it trivial to stub in
 * unit tests.
 */
interface KofiWebhookResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

/**
 * Timing-safe string comparison for the Ko-fi verification token.
 *
 * Performs a length check up front so that `timingSafeEqual` (which
 * throws if the buffer lengths differ) is only invoked on equal-length
 * inputs. The two string arguments are NEVER logged — they are
 * verification tokens.
 */
export function tokensMatch(expected: string, provided: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export type RejectionReason =
  | 'channel_not_found'
  | 'not_configured'
  | 'invalid_token'
  | 'duplicate';

/**
 * Dependency-injection seam for tests. Each field is optional; defaults
 * pull from the live database/parser. Tests pass in a stub `deps` object
 * to avoid touching a real Prisma client or Redis.
 */
export interface KofiWebhookDeps {
  findChannelBySlug?: (slug: string) => Promise<{ id: string; slug: string } | null>;
  getDecryptedToken?: (channelId: string) => Promise<string | null>;
  parseForm?: (body: unknown) => ReturnType<typeof parseKofiFormData>;
  claimDedup?: (input: {
    provider: string;
    rawEventId: string;
    channelId: string;
  }) => Promise<boolean>;
  storeAndPublish?: typeof storeAndPublishAlertEvent;
}

const defaultDeps: Required<KofiWebhookDeps> = {
  findChannelBySlug: async (slug) => {
    const channel = await prisma.channel.findUnique({ where: { slug } });
    return channel ? { id: channel.id, slug: channel.slug } : null;
  },
  getDecryptedToken: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: 'kofi',
      key: 'kofi.verification_token',
    }),
  parseForm: (body) => parseKofiFormData(body as { data?: unknown }),
  claimDedup: claimDeduplicationKey,
  storeAndPublish: storeAndPublishAlertEvent,
};

/**
 * Express handler for the path-based Ko-fi webhook:
 *   POST /api/webhooks/kofi/:channelSlug
 *
 * Resolves the channel from the URL slug, loads its stored Ko-fi
 * verification token (encrypted at rest), validates the inbound token
 * with a timing-safe comparison, deduplicates by `rawEventId`, and
 * stores + publishes the event. Never logs the token value; the only
 * identifiers it emits are `channelSlug`, `rawEventId`, and opaque
 * rejection reasons.
 *
 * Note: the route-level integration is exercised manually via the
 * README's `curl` recipe. The unit tests in
 * `apps/ingress/src/__tests__/kofi-webhook.test.ts` cover the handler
 * directly by invoking it with stub `deps` and stub Express
 * req/response objects.
 */
export async function handleKofiWebhook(
  request: Pick<Request, 'params' | 'body'>,
  response: KofiWebhookResponse,
  deps: KofiWebhookDeps = {},
): Promise<void> {
  const channelSlug = request.params.channelSlug;
  if (typeof channelSlug !== 'string' || channelSlug.length === 0) {
    response.status(400).json({ error: 'Missing channelSlug' });
    return;
  }

  const resolved: Required<KofiWebhookDeps> = { ...defaultDeps, ...deps };
  const findChannel = resolved.findChannelBySlug;
  const getToken = resolved.getDecryptedToken;
  const parseForm = resolved.parseForm;
  const claimKey = resolved.claimDedup;
  const publish = resolved.storeAndPublish;

  const channel = await findChannel(channelSlug);
  if (!channel) {
    console.warn('kofi webhook rejected', { channelSlug, reason: 'channel_not_found' });
    response.status(404).json({ error: 'Channel not found' });
    return;
  }

  const expectedToken = await getToken(channel.id);
  if (!expectedToken) {
    console.warn('kofi webhook rejected', { channelSlug, reason: 'not_configured' });
    response.status(503).json({ error: 'Ko-fi not configured for this channel' });
    return;
  }

  let parsed: ReturnType<typeof parseKofiFormData>;
  try {
    parsed = parseForm(request.body);
  } catch {
    // parseKofiFormData throws on missing/malformed `data` field. The
    // exact reason isn't useful to the caller and certainly not in a
    // log line that could leak the token.
    response.status(400).json({ error: 'Malformed Ko-fi payload' });
    return;
  }

  if (!tokensMatch(expectedToken, parsed.verificationToken)) {
    console.warn('kofi webhook rejected', { channelSlug, reason: 'invalid_token' });
    response.status(401).json({ error: 'Invalid verification token' });
    return;
  }

  const fresh = await claimKey({
    provider: 'kofi',
    rawEventId: parsed.rawEventId,
    channelId: channel.id,
  });
  if (!fresh) {
    console.warn('kofi webhook rejected', { channelSlug, reason: 'duplicate' });
    response.status(200).json({ ok: true, duplicate: true });
    return;
  }

  console.info('kofi webhook accepted', { channelSlug, rawEventId: parsed.rawEventId });

  const event: AlertEvent | null = await publish({ ...parsed.event, channelId: channel.id });
  if (!event) {
    response.status(200).json({ ok: true, duplicate: false, suppressed: true });
    return;
  }

  response.status(200).json({ ok: true, duplicate: false, event });
}

/**
 * Express handler that delegates to `handleKofiWebhook` with the live
 * defaults. The dep-injection point is the test entry; this wrapper
 * exists so `server.ts` can register it as a normal Express handler
 * (which requires the `(req, res, next)` shape).
 */
export async function kofiWebhookExpressHandler(
  request: Request,
  response: KofiWebhookResponse,
  _next: NextFunction,
): Promise<void> {
  await handleKofiWebhook(request, response);
}
