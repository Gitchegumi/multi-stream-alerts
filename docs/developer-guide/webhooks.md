# Webhooks

Provider ingress code normalizes incoming payloads into shared alert event fields, claims deduplication keys, resolves alert configuration, stores the event, and publishes it to Redis.

The overlay stream route subscribes to Redis and sends matching channel events to browser sources over Server-Sent Events.

## Provider callbacks

- **Twitch** (`POST /api/webhooks/twitch`): a single global callback. The receiving channel is identified by matching the inbound signature against the per-channel EventSub secret that was generated during OAuth auto-provisioning.
- **YouTube** (`/api/webhooks/youtube/:channelSlug`): a per-channel WebSub callback.
  - `GET` handles the hub's intent verification by echoing `hub.challenge`, but only when a matching `ProviderSubscription` row exists (so we never confirm subscriptions we did not request).
  - `POST` verifies the `X-Hub-Signature` HMAC against the channel's stored WebSub secret before processing the notification.

Webhook handlers should avoid logging secrets or raw credential values.
