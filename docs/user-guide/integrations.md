# Platform Integrations

GitchAlerts turns events from Ko-fi, Twitch, and YouTube into alerts on your canvases. Provider credentials are configured per workspace in the dashboard under **Settings -> Integrations**. They are encrypted at rest and are never sent back to the browser after you save them.

## Ko-fi

Ko-fi is fully supported for tips, subscriptions, commissions, and shop orders.

1. Open **Settings -> Integrations -> Ko-fi**.
2. Copy your channel webhook URL. It follows the pattern `https://<your-alerts-domain>/api/webhooks/kofi/<your-channel-slug>`.
3. In Ko-fi, open your webhook/API settings and paste the URL.
4. Copy the Ko-fi verification token into the dashboard field and save.

Duplicate Ko-fi `message_id` values are ignored, and private Ko-fi messages are not shown in overlays.

## Twitch

Configure Twitch credentials under **Settings -> Integrations -> Twitch**. Each channel stores an EventSub secret, OAuth client ID and secret, and the numeric broadcaster ID. If instance-level Twitch app credentials are configured, you can also connect or disconnect a Twitch account from the same page instead of pasting secrets by hand.

Twitch uses a single global callback URL; the receiving channel is identified by matching the inbound signature against your stored EventSub secret.

Note: Twitch EventSub subscription management and event normalization are still in progress. You can store credentials today, but live Twitch alerts are not yet delivered end to end.

## YouTube

Configure YouTube credentials under **Settings -> Integrations -> YouTube**. Each channel stores a Google OAuth client ID and secret, and the webhook URL is per-channel: `https://<your-alerts-domain>/api/webhooks/youtube/<your-channel-slug>`.

Note: YouTube Super Chat and membership ingestion is still in progress. Credentials can be stored now, but live YouTube alerts are not yet delivered end to end.

## Testing without a live event

You do not need a real tip or follow to check your setup. Select a canvas in **Alerts**, and use the test action beside an alert type (or **Test canvas**) to send a sample event through the same pipeline real webhooks use. See [Alerts](alerts.md) and [Troubleshooting](troubleshooting.md).
