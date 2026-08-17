# Platform Integrations

GitchAlerts turns events from Ko-fi, Twitch, and YouTube into alerts on your canvases. Manage them per workspace in the dashboard under **Settings -> Integrations**, where each provider appears as a compact card showing its connection status and one primary action.

Twitch and YouTube connect through OAuth: you click **Connect**, sign in to the provider, approve access, and GitchAlerts links the account and sets up event delivery for you. You never paste EventSub secrets, Client IDs, Client Secrets, or stream keys. Ko-fi has no OAuth flow, so it keeps a small manual token field. Any stored secrets are encrypted at rest and are never sent back to the browser.

The app-level Twitch/YouTube provider credentials are configured once by the self-hosting administrator via environment variables. Administrators can follow [Twitch and YouTube OAuth Setup](../developer-guide/oauth-provider-setup.md); the complete variable reference is under [Environment Variables](../developer-guide/environment-variables.md). If the credentials are not set, the Connect buttons show an **Unavailable** state.

## Ko-fi

Ko-fi is fully supported for tips, subscriptions, commissions, and shop orders.

1. Open **Settings -> Integrations -> Ko-fi**.
2. Copy your channel webhook URL. It follows the pattern `https://<your-alerts-domain>/api/webhooks/kofi/<your-channel-slug>`.
3. In Ko-fi, open your webhook/API settings and paste the URL.
4. Copy the Ko-fi verification token into the dashboard field and save.

Duplicate Ko-fi `message_id` values are ignored, and private Ko-fi messages are not shown in overlays.

## Twitch

Open **Settings -> Integrations -> Twitch** and click **Connect Twitch**. You are redirected to Twitch to approve access; when you return, GitchAlerts links the account and automatically provisions the EventSub subscriptions (follows, subs, gifts, cheers, raids, charity, and channel-point redemptions) against a global webhook callback. There is nothing to paste.

The card shows every linked Twitch channel with its own **Disconnect** button. Use **Add another channel** to connect up to five Twitch channels to the workspace. Disconnecting one channel removes its remote EventSub subscriptions while preserving alerts for the others. If GitchAlerts later needs broader permissions, the card shows **Needs reconnect** — connect the affected account again to re-approve.

## YouTube

Open **Settings -> Integrations -> YouTube** and click **Connect YouTube**. After you approve access, GitchAlerts resolves your channel and subscribes to its upload/live feed via WebSub, verifying every incoming notification. You can link more than one YouTube channel to a workspace and mark one as **Primary**; **Disconnect** removes the subscription for that channel.

WebSub subscriptions expire after a few days and are renewed automatically by the background worker, so no periodic action is needed.

## Testing without a live event

You do not need a real tip or follow to check your setup. Select a canvas in **Alerts**, and use the test action beside an alert type (or **Test canvas**) to send a sample event through the same pipeline real webhooks use. See [Alerts](alerts.md) and [Troubleshooting](troubleshooting.md).
