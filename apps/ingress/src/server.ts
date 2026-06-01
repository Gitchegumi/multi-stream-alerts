import express from "express";
import { ensureDefaultChannel, claimDeduplicationKey, storeAndPublishAlertEvent } from "@multi-stream-alerts/database";
import { parseIngressEnv } from "@multi-stream-alerts/shared";
import { parseKofiFormData } from "./kofi";
import { verifyTwitchEventSubSignature } from "./twitch";

const env = parseIngressEnv(process.env);
const app = express();

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/webhooks/kofi", express.urlencoded({ extended: false }), async (request, response, next) => {
  try {
    const channel = await ensureDefaultChannel();
    const parsed = parseKofiFormData(request.body);

    if (parsed.verificationToken !== env.KOFI_VERIFICATION_TOKEN) {
      response.status(401).json({ error: "Invalid verification token" });
      return;
    }

    const claimed = await claimDeduplicationKey({
      provider: "kofi",
      rawEventId: parsed.rawEventId,
      channelId: channel.id
    });

    if (!claimed) {
      response.status(200).json({ ok: true, duplicate: true });
      return;
    }

    await storeAndPublishAlertEvent({
      channelId: channel.id,
      ...parsed.event
    });

    response.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/webhooks/twitch", express.raw({ type: "*/*" }), async (request, response) => {
  try {
    const messageType = request.header("twitch-eventsub-message-type");
    const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.from("");
    const signatureValid = verifyTwitchEventSubSignature({
      secret: env.TWITCH_EVENTSUB_SECRET,
      messageId: request.header("twitch-eventsub-message-id"),
      timestamp: request.header("twitch-eventsub-message-timestamp"),
      signature: request.header("twitch-eventsub-message-signature"),
      rawBody
    });

    if (!signatureValid) {
      response.status(401).json({ error: "Invalid Twitch EventSub signature" });
      return;
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as { challenge?: string };

    if (messageType === "webhook_callback_verification" && payload.challenge) {
      response.status(200).type("text/plain").send(payload.challenge);
      return;
    }

    // TODO: Normalize Twitch EventSub notifications after OAuth subscription setup exists.
    response.status(501).json({ error: "Twitch EventSub ingestion is stubbed for future implementation" });
  } catch {
    response.status(400).json({ error: "Malformed Twitch EventSub payload" });
  }
});

app.post("/api/webhooks/youtube", express.json({ type: "*/*" }), (_request, response) => {
  // TODO: Add YouTube webhook/live chat verification and normalize Super Chat, memberships, and related events.
  response.status(501).json({ error: "YouTube ingestion is stubbed for future implementation" });
});

app.use((_request, response) => {
  response.status(404).json({ error: "Not found" });
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unexpected webhook error";
  response.status(400).json({ error: message });
});

app.listen(env.INGRESS_PORT, () => {
  console.log(`alerts-ingress listening on port ${env.INGRESS_PORT}`);
});
