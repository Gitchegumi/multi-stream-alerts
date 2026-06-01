import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTwitchEventSubSignature(input: {
  secret?: string;
  messageId?: string;
  timestamp?: string;
  signature?: string;
  rawBody: Buffer;
}) {
  if (!input.secret || !input.messageId || !input.timestamp || !input.signature) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", input.secret)
    .update(input.messageId + input.timestamp)
    .update(input.rawBody)
    .digest("hex")}`;

  const expectedBuffer = Buffer.from(expected);
  const signatureBuffer = Buffer.from(input.signature);

  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}
