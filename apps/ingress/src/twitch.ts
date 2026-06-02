import { createHmac, timingSafeEqual } from 'node:crypto';

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
