import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AlertType, AlertPlatform } from '@multi-stream-alerts/shared';

/**
 * Minimal regex-based parser for Atom feed entries from the YouTube
 * PubSubHubbHub callback. YouTube sends `application/atom+xml`
 * containing a single `<entry>` for new uploads/livestreams.
 *
 * The function never throws: malformed XML simply returns partial
 * or empty fields. Callers should validate `id` before using the result.
 */
export function parseAtomEntry(xml: string) {
  const id = xml.match(/<id>yt:video:([^<]+)<\/id>/)?.[1];
  const channelId = xml.match(/<yt:channelId>([^<]+)<\/yt:channelId>/)?.[1];
  const title = xml.match(/<title>([^<]*)<\/title>/)?.[1];
  const author = xml.match(/<name>([^<]+)<\/name>/)?.[1];
  return { id, channelId, title, author };
}

/**
 * Normalized YouTube PubSub event, ready to pass to
 * `storeAndPublishAlertEvent`.
 */
export interface NormalizedYoutubeEvent {
  platform: AlertPlatform;
  type: AlertType;
  eventKey: string;
  displayName: string;
  platformAccountId?: string;
  rawEventId: string;
  rawPayload: unknown;
}

/**
 * Normalize a YouTube PubSub payload (Atom XML string) into the
 * internal alert-event shape.
 *
 * PubSub sends a feed with an `<entry>` for new videos. We map this
 * to `stream_online`. `stream_offline` is not available from PubSub;
 * we skip it for now.
 *
 * Returns `null` when the XML contains no recognizable video entry.
 */
export function normalizeYoutubePubSub(payload: unknown): NormalizedYoutubeEvent | null {
  if (typeof payload !== 'string') return null;

  const entry = parseAtomEntry(payload);
  if (!entry.id || !entry.channelId) {
    return null;
  }

  return {
    platform: 'youtube',
    type: 'stream_online',
    eventKey: 'youtube.stream_online',
    displayName: entry.author?.trim() || 'YouTube channel',
    platformAccountId: entry.channelId,
    rawEventId: entry.id,
    rawPayload: entry,
  };
}

/**
 * Verify the `X-Hub-Signature` HMAC on an inbound WebSub notification.
 * Google's PubSubHubbub hub signs the raw request body with the secret we
 * supplied at subscribe time, formatted as `sha1=<hexdigest>`. Comparison is
 * `timingSafeEqual` with a length pre-check so we never leak timing on a
 * length mismatch. Returns false when the header or secret is missing.
 */
export function verifyYoutubeWebSubSignature(input: {
  secret: string;
  signature?: string;
  rawBody: Buffer;
}): boolean {
  if (!input.signature || !input.secret) return false;

  // The header may be `sha1=…` (Google's default) or `sha256=…`.
  const match = input.signature.match(/^(sha1|sha256)=([0-9a-f]+)$/i);
  if (!match) return false;
  const algorithm = match[1]!.toLowerCase();

  const expected = `${algorithm}=${createHmac(algorithm, input.secret)
    .update(input.rawBody)
    .digest('hex')}`;
  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(input.signature);
  return (
    expectedBuffer.length === signatureBuffer.length &&
    timingSafeEqual(expectedBuffer, signatureBuffer)
  );
}
