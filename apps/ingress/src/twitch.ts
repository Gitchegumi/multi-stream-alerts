import { createHmac, timingSafeEqual } from 'node:crypto';
import type { AlertType, AlertPlatform } from '@multi-stream-alerts/shared';

/**
 * Verifier result for the Twitch EventSub HMAC match-loop.
 *
 * - `valid: true` only when one of the candidate secrets produced an
 *   HMAC that timing-safely matched the inbound `Twitch-Eventsub-Message-Signature`.
 * - `channelId` is the channel whose stored `twitch.eventsub_secret`
 *   matched. The secret value itself is NEVER included in the return
 *   value.
 * - When `valid` is false, `channelId` is null. Callers should not
 *   trust `channelId` in that case.
 */
export type TwitchSignatureResult = {
  channelId: string | null;
  valid: boolean;
};

/**
 * Normalized Twitch EventSub event, ready to pass to
 * `storeAndPublishAlertEvent`.
 */
export interface NormalizedTwitchEvent {
  platform: AlertPlatform;
  type: AlertType;
  eventKey: string;
  displayName: string;
  amount?: number;
  currency?: string;
  message?: string;
  isPublic?: boolean;
  tier?: string;
  quantity?: number;
  rawEventId: string;
  rawPayload: unknown;
}

const typeMap: Record<string, AlertType> = {
  'channel.follow': 'follow',
  'channel.subscribe': 'subscription',
  'channel.subscription.gift': 'gift',
  'channel.cheer': 'cheer',
  'channel.raid': 'raid',
  'channel.hypechat': 'hypechat',
  'channel.charity_campaign.donate': 'charity_donation',
  'channel.channel_points_custom_reward_redemption.add': 'redemption',
};

const eventKeyMap: Record<string, string> = {
  'channel.follow': 'twitch.followed',
  'channel.subscribe': 'twitch.subscribed',
  'channel.subscription.gift': 'twitch.gifted',
  'channel.cheer': 'twitch.cheered',
  'channel.raid': 'twitch.raided',
  'channel.hypechat': 'twitch.hypechat',
  'channel.charity_campaign.donate': 'twitch.charity_donation',
  'channel.channel_points_custom_reward_redemption.add': 'twitch.redemption',
};

function extractAmount(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.bits === 'number') return p.bits;
  if (typeof p.total === 'number') return p.total;
  if (typeof p.viewers === 'number') return p.viewers;
  if (typeof p.amount === 'number') return p.amount;
  if (typeof p.amount === 'object' && p.amount !== null) {
    const amt = p.amount as Record<string, unknown>;
    if (typeof amt.value === 'number' && typeof amt.decimal_places === 'number') {
      return amt.value / Math.pow(10, amt.decimal_places);
    }
  }
  return undefined;
}

function extractCurrency(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  if (typeof p.currency === 'string') return p.currency;
  if (typeof p.amount === 'object' && p.amount !== null) {
    const amt = p.amount as Record<string, unknown>;
    if (typeof amt.currency === 'string') return amt.currency;
  }
  return undefined;
}

function extractDisplayName(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return 'Twitch user';
  const p = payload as Record<string, unknown>;
  return typeof p.user_name === 'string' && p.user_name.trim().length > 0
    ? p.user_name.trim()
    : typeof p.from_broadcaster_user_name === 'string' &&
        p.from_broadcaster_user_name.trim().length > 0
      ? p.from_broadcaster_user_name.trim()
      : 'Twitch user';
}

function extractMessage(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  return typeof p.message === 'string' && p.message.trim().length > 0
    ? p.message.trim()
    : undefined;
}

function extractTier(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  return typeof p.tier === 'string' ? p.tier : undefined;
}

function extractQuantity(payload: unknown): number | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const p = payload as Record<string, unknown>;
  return typeof p.total === 'number' ? p.total : undefined;
}

function extractRawEventId(payload: unknown): string {
  if (typeof payload !== 'object' || payload === null) return '';
  const p = payload as Record<string, unknown>;
  if (typeof p.id === 'string') return p.id;
  if (typeof p.donation_id === 'string') return p.donation_id;
  return '';
}

/**
 * Normalize a Twitch EventSub payload into the internal alert-event
 * shape. Returns `null` for unmapped or unsupported subscription types.
 *
 * The function never throws: malformed payloads simply return `null`.
 */
export function normalizeTwitchEventSub(payload: unknown): NormalizedTwitchEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;

  const p = payload as Record<string, unknown>;
  const sub =
    typeof p.subscription === 'object' && p.subscription !== null
      ? (p.subscription as Record<string, unknown>)
      : {};
  const subType = typeof sub.type === 'string' ? sub.type : undefined;
  const event =
    typeof p.event === 'object' && p.event !== null ? (p.event as Record<string, unknown>) : {};

  if (!subType || !(subType in typeMap)) return null;

  const rawEventId = extractRawEventId(event);
  if (!rawEventId) return null;

  const type = typeMap[subType]!;
  const eventKey = eventKeyMap[subType] ?? 'twitch.unknown';
  const displayName = extractDisplayName(event);

  return {
    platform: 'twitch',
    type,
    eventKey,
    displayName,
    amount: extractAmount(event),
    currency: extractCurrency(event),
    message: extractMessage(event),
    isPublic: true,
    tier: extractTier(event),
    quantity: extractQuantity(event),
    rawEventId,
    rawPayload: payload,
  };
}

/**
 * Twitch EventSub signature verification, refactored for the
 * per-workspace-credentials model.
 *
 * The EventSub callback URL is global per Twitch application, so the
 * receiving channel is identified implicitly: walk every configured
 * (channelId, secret) pair and find the one whose stored secret
 * validates the inbound HMAC. Returns the first match (defense in
 * depth: a single inbound event should only validate against a
 * single channel's secret in practice, but if two channels ever
 * share a secret we still pick deterministically).
 *
 * The HMAC payload is `messageId + timestamp + rawBody` per
 * https://dev.twitch.tv/docs/eventsub/handling-webhook-events/#verifying-the-event-message-signature.
 * Comparison is `timingSafeEqual` with a length pre-check so we never
 * throw on a header / body length mismatch.
 *
 * The function never logs, never throws, and never returns the
 * secret value. Callers can pass the structured result to a logger
 * that emits only the channelId.
 */
export function verifyTwitchEventSubSignature(input: {
  candidates: Array<{ channelId: string; secret: string }>;
  messageId?: string;
  timestamp?: string;
  signature?: string;
  rawBody: Buffer;
}): TwitchSignatureResult {
  if (!input.messageId || !input.timestamp || !input.signature) {
    return { channelId: null, valid: false };
  }

  const signatureBuffer = Buffer.from(input.signature);
  for (const candidate of input.candidates) {
    const expected = `sha256=${createHmac('sha256', candidate.secret)
      .update(input.messageId + input.timestamp)
      .update(input.rawBody)
      .digest('hex')}`;
    const expectedBuffer = Buffer.from(expected);
    if (
      expectedBuffer.length === signatureBuffer.length &&
      timingSafeEqual(expectedBuffer, signatureBuffer)
    ) {
      return { channelId: candidate.channelId, valid: true };
    }
  }
  return { channelId: null, valid: false };
}
