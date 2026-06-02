import express from "express";
import { parseIngressEnv } from "@multi-stream-alerts/shared";
import { kofiWebhookExpressHandler } from "./kofi-webhook";
import { twitchWebhookExpressHandler } from "./twitch-webhook";

const env = parseIngressEnv(process.env);
const app = express();

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.json({ ok: true });
});

app.post(
  "/api/webhooks/kofi/:channelSlug",
  express.urlencoded({ extended: false }),
  kofiWebhookExpressHandler
);

app.post("/api/webhooks/twitch", express.raw({ type: "*/*" }), twitchWebhookExpressHandler);

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
