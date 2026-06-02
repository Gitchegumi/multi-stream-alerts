import type { Request, NextFunction } from "express";
import {
  prisma,
  getChannelDecryptedSecret
} from "@multi-stream-alerts/database";

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

export type YoutubeRejectionReason = "channel_not_found" | "not_configured";

/**
 * Dependency-injection seam for tests. Each field is optional; defaults
 * pull from the live database. Tests pass in a stub `deps` object to
 * avoid touching a real Prisma client.
 *
 * - `findChannelBySlug` resolves the channel from the URL slug.
 * - `getDecryptedClientId` / `getDecryptedClientSecret` load the
 *   channel's stored YouTube OAuth credentials.
 */
export interface YoutubeWebhookDeps {
  findChannelBySlug?: (slug: string) => Promise<{ id: string; slug: string } | null>;
  getDecryptedClientId?: (channelId: string) => Promise<string | null>;
  getDecryptedClientSecret?: (channelId: string) => Promise<string | null>;
}

const defaultDeps: Required<YoutubeWebhookDeps> = {
  findChannelBySlug: async (slug) => {
    const channel = await prisma.channel.findUnique({ where: { slug } });
    return channel ? { id: channel.id, slug: channel.slug } : null;
  },
  getDecryptedClientId: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: "youtube",
      key: "youtube.client_id"
    }),
  getDecryptedClientSecret: (channelId) =>
    getChannelDecryptedSecret({
      channelId,
      provider: "youtube",
      key: "youtube.client_secret"
    })
};

/**
 * Express handler for the path-based YouTube Pub/Sub hub callback:
 *   POST /api/webhooks/youtube/:channelSlug
 *
 * Resolves the channel from the URL slug and loads its stored
 * YouTube OAuth client_id / client_secret (encrypted at rest). The
 * actual Pub/Sub hub challenge verification and event normalization
 * are future work; v1 returns a 501 stub once credentials are present
 * to prove the resolution + decryption paths work end-to-end.
 *
 * Never logs the client_id or client_secret value. The only
 * identifiers it emits are `channelSlug`, `channelId`, and the
 * opaque rejection reason.
 *
 * Note: the route-level integration is exercised manually via the
 * README's `curl` recipe. The unit tests in
 * `apps/ingress/src/__tests__/youtube-webhook.test.ts` cover the
 * handler directly by invoking it with stub `deps` and stub
 * Express req/response objects.
 */
export async function handleYoutubeWebhook(
  request: Pick<Request, "params" | "body">,
  response: YoutubeWebhookResponse,
  deps: YoutubeWebhookDeps = {}
): Promise<void> {
  const channelSlug = request.params.channelSlug;
  if (typeof channelSlug !== "string" || channelSlug.length === 0) {
    response.status(400).json({ error: "Missing channelSlug" });
    return;
  }

  const resolved: Required<YoutubeWebhookDeps> = { ...defaultDeps, ...deps };
  const findChannel = resolved.findChannelBySlug;
  const getClientId = resolved.getDecryptedClientId;
  const getClientSecret = resolved.getDecryptedClientSecret;

  const channel = await findChannel(channelSlug);
  if (!channel) {
    console.warn("youtube webhook rejected", { channelSlug, reason: "channel_not_found" });
    response.status(404).json({ error: "Channel not found" });
    return;
  }

  // Load both credentials up front. Either being null means the channel
  // is not fully configured for YouTube ingestion.
  const [clientId, clientSecret] = await Promise.all([
    getClientId(channel.id),
    getClientSecret(channel.id)
  ]);

  if (!clientId || !clientSecret) {
    console.warn("youtube webhook rejected", { channelSlug, reason: "not_configured" });
    response.status(503).json({ error: "YouTube not configured for this channel" });
    return;
  }

  // Future OAuth verification would happen here. For v1 we return the
  // same 501 stub the old global route did, but only AFTER successfully
  // resolving + decrypting the channel's credentials.
  console.info("youtube webhook accepted", { channelSlug, channelId: channel.id });
  response.status(501).json({ error: "YouTube ingestion is stubbed for future implementation" });
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
  _next: NextFunction
): Promise<void> {
  await handleYoutubeWebhook(request, response);
}
