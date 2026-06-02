import type { Request, NextFunction } from "express";
import { getAllTwitchEventSubSecrets } from "@multi-stream-alerts/database";
import { verifyTwitchEventSubSignature } from "./twitch";

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
 * object to avoid touching a real Prisma client.
 *
 * - `getCandidates` returns every configured (channelId, secret) pair
 *   for the Twitch match-loop.
 * - `verifySignature` runs the HMAC match-loop. Tests can stub it to
 *   return a deterministic result.
 */
export interface TwitchWebhookDeps {
  getCandidates?: () => Promise<Array<{ channelId: string; secret: string }>>;
  verifySignature?: typeof verifyTwitchEventSubSignature;
}

const defaultDeps: Required<TwitchWebhookDeps> = {
  getCandidates: getAllTwitchEventSubSecrets,
  verifySignature: verifyTwitchEventSubSignature
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
 * 4. On a match, log `twitch webhook accepted` with `channelId` and
 *    return 501 (EventSub event normalization is still future work;
 *    this handler only wires the authentication path).
 *
 * Logging policy: channelId is the only credential-derived identifier
 * emitted. The secret value, the inbound signature, and the raw body
 * are NEVER written to logs. The function must not throw if
 * `getCandidates` returns an empty array — the verifier short-circuits
 * to `{ channelId: null, valid: false }` and we 401.
 */
export async function handleTwitchWebhook(
  request: Pick<Request, "headers" | "body">,
  response: TwitchWebhookResponse,
  deps: TwitchWebhookDeps = {}
): Promise<void> {
  const resolved: Required<TwitchWebhookDeps> = { ...defaultDeps, ...deps };
  const getCandidates = resolved.getCandidates;
  const verifySignature = resolved.verifySignature;

  const candidates = await getCandidates();

  const messageId = headerString(request.headers["twitch-eventsub-message-id"]);
  const timestamp = headerString(request.headers["twitch-eventsub-message-timestamp"]);
  const signature = headerString(request.headers["twitch-eventsub-message-signature"]);

  // express.raw() puts the raw body on `body` as a Buffer.
  const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");

  const result = verifySignature({
    candidates,
    messageId,
    timestamp,
    signature,
    rawBody
  });

  if (!result.valid) {
    console.warn("twitch webhook rejected", { reason: "no_matching_secret" });
    response.status(401).json({ error: "Invalid Twitch EventSub signature" });
    return;
  }

  console.info("twitch webhook accepted", { channelId: result.channelId });
  response.status(501).json({
    error: "Twitch EventSub ingestion is stubbed pending per-workspace credential wiring"
  });
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
  _next: NextFunction
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
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") return value[0];
  return undefined;
}
