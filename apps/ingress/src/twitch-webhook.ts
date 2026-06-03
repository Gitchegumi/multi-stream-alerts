import type { Request, NextFunction } from 'express';
import {
  getAllTwitchEventSubSecrets,
  claimDeduplicationKey,
  storeAndPublishAlertEvent,
} from '@multi-stream-alerts/database';
import type { AlertEvent } from '@multi-stream-alerts/shared';
import { verifyTwitchEventSubSignature, normalizeTwitchEventSub } from './twitch';

/**
 * Structural shape for the Express `Response` that the handler uses.
 * The handler only ever calls `response.status(code).json(body)`, so
 * declaring a narrow interface here keeps the handler decoupled from
 * the full Express `Response` type and makes it trivial to stub in
 * unit tests.
 */
interface TwitchWebhookResponse {
  status: (code: number) => { json: (body: unknown) => void };
}

/**
 * Dependency-injection seam for tests. Each field is optional; defaults
 * pull from the live database / verifier. Tests pass in a stub `deps`
 * object to avoid touching a real Prisma client or Redis.
 *
 * - `getCandidates` returns every configured (channelId, secret) pair
 *   for the Twitch match-loop.
 * - `verifySignature` runs the HMAC match-loop. Tests can stub it to
 *   return a deterministic result.
 * - `normalizeEvent` maps EventSub subscription types to internal alert
 *   events. Tests stub it to control event shapes.
 * - `claimDedup` deduplicates by raw event id.
 * - `storeAndPublish` persists the event and pushes it to Redis.
 */
export interface TwitchWebhookDeps {
  getCandidates?: () => Promise<Array<{ channelId: string; secret: string }>>;
  verifySignature?: typeof verifyTwitchEventSubSignature;
  normalizeEvent?: typeof normalizeTwitchEventSub;
  claimDedup?: (input: {
    provider: string;
    rawEventId: string;
    channelId: string;
  }) => Promise<boolean>;
  storeAndPublish?: typeof storeAndPublishAlertEvent;
}

const defaultDeps: Required<TwitchWebhookDeps> = {
  getCandidates: getAllTwitchEventSubSecrets,
  verifySignature: verifyTwitchEventSubSignature,
  normalizeEvent: normalizeTwitchEventSub,
  claimDedup: claimDeduplicationKey,
  storeAndPublish: storeAndPublishAlertEvent,
};

/**
 * Twitch EventSub webhook handler. Wired in `server.ts` at
 *   POST /api/webhooks/twitch
 * (Twitch's callback URL is global per app, so no channel slug in
 * the path; we identify the receiving channel by which stored
 * `twitch.eventsub_secret` validates the HMAC).
 *
 * Behavior:
 * 1. Pull every configured (channelId, secret) pair.
 * 2. Run the HMAC match-loop against the inbound headers + raw body.
 * 3. On no match, log `twitch webhook rejected` with `no_matching_secret`
 *    and return 401.
 * 4. On a match, parse the raw body as JSON and normalize the EventSub
 *    payload to an internal alert event.
 * 5. If normalization returns `null`, log `twitch webhook suppressed`
 *    with `reason: 'unmapped'` and return 204.
 * 6. Claim the deduplication key. If duplicate, return 200 with
 *    `{ ok: true, duplicate: true }`.
 * 7. Call `storeAndPublishAlertEvent`. If it returns `null` (alert type
 *    disabled), return 200 with `{ ok: true, suppressed: true }`.
 * 8. Otherwise return 200 with `{ ok: true, event }`.
 *
 * Logging policy: channelId and rawEventId are the only identifiers
 * emitted. The secret value, the inbound signature, and the raw body
 * are NEVER written to logs. The function must not throw if
 * `getCandidates` returns an empty array — the verifier short-circuits
 * to `{ channelId: null, valid: false }` and we 401.
 */
export async function handleTwitchWebhook(
  request: Pick<Request, 'headers' | 'body'>,
  response: TwitchWebhookResponse,
  deps: TwitchWebhookDeps = {},
): Promise<void> {
  const resolved: Required<TwitchWebhookDeps> = { ...defaultDeps, ...deps };
  const getCandidates = resolved.getCandidates;
  const verifySignature = resolved.verifySignature;
  const normalizeEvent = resolved.normalizeEvent;
  const claimKey = resolved.claimDedup;
  const publish = resolved.storeAndPublish;

  const candidates = await getCandidates();

  const messageId = headerString(request.headers['twitch-eventsub-message-id']);
  const timestamp = headerString(request.headers['twitch-eventsub-message-timestamp']);
  const signature = headerString(request.headers['twitch-eventsub-message-signature']);

  // express.raw() puts the raw body on `body` as a Buffer.
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from('');

  const result = verifySignature({
    candidates,
    messageId,
    timestamp,
    signature,
    rawBody,
  });

  if (!result.valid) {
    console.warn('twitch webhook rejected', { reason: 'no_matching_secret' });
    response.status(401).json({ error: 'Invalid Twitch EventSub signature' });
    return;
  }

  // Narrowing: result.valid === true guarantees channelId is non-null.
  const channelId = result.channelId as string;

  console.info('twitch webhook accepted', { channelId });

  // Twitch sends the JSON payload as the raw body. Parse it so the
  // normalizer can inspect `subscription.type` and `event` fields.
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    console.warn('twitch webhook suppressed', { channelId, reason: 'unmapped' });
    response.status(204).json({});
    return;
  }

  const normalized = normalizeEvent(payload);

  if (normalized === null) {
    console.warn('twitch webhook suppressed', { channelId, reason: 'unmapped' });
    response.status(204).json({});
    return;
  }

  const fresh = await claimKey({
    provider: 'twitch',
    rawEventId: normalized.rawEventId,
    channelId,
  });
  if (!fresh) {
    response.status(200).json({ ok: true, duplicate: true });
    return;
  }

  const event: AlertEvent | null = await publish({ ...normalized, channelId });
  if (!event) {
    response.status(200).json({ ok: true, suppressed: true });
    return;
  }

  response.status(200).json({ ok: true, event });
}

/**
 * Express handler that delegates to `handleTwitchWebhook` with the
 * live defaults. The dep-injection point is the unit-test entry; this
 * wrapper exists so `server.ts` can register it as a normal Express
 * handler (which requires the `(req, res, next)` shape).
 */
export async function twitchWebhookExpressHandler(
  request: Request,
  response: TwitchWebhookResponse,
  _next: NextFunction,
): Promise<void> {
  await handleTwitchWebhook(request, response);
}

/**
 * Coerce an Express header value (which can be `string | string[] | undefined`)
 * to a single string, or undefined if missing. Express normalizes
 * header names to lowercase, so we read the same name in `server.ts`'s
 * `express.raw()` route.
 */
function headerString(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') return value[0];
  return undefined;
}
