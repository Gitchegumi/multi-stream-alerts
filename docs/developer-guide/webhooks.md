# Webhooks

Provider ingress code normalizes incoming payloads into shared alert event fields, claims deduplication keys, resolves alert configuration, stores the event, and publishes it to Redis.

The overlay stream route subscribes to Redis and sends matching channel events to browser sources over Server-Sent Events.

Webhook handlers should avoid logging secrets or raw credential values.
