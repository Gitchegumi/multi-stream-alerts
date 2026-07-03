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
