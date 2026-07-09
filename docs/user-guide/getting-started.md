# Getting Started

GitchAlerts lets you run stream alerts from your own deployment instead of depending on a hosted alert provider. You create canvases, copy their browser-source URLs into OBS or another streaming app, and assign alert types such as Ko-fi tips, Twitch follows, or YouTube super chats to those canvases.

## What you need

- A GitchAlerts deployment and a dashboard sign-in for your workspace.
- OBS, Streamlabs, Twitch Studio, Meld, or another app that supports browser sources.
- Provider credentials (Ko-fi, and optionally Twitch or YouTube) if you want live events. See [Platform integrations](integrations.md).

## First run

1. Open your GitchAlerts dashboard and sign in with the configured account provider.
2. Open **Alerts** to manage canvases and alert assignments.
3. Select or create a canvas, place your layers, and assign the alert types it should receive.
4. Copy the canvas browser-source URL and add it as a browser source in your streaming software. Match the source width and height to the canvas settings.
5. Use **Test canvas** to confirm the source is receiving alerts.

From here, see [Canvases](canvases.md) for the editor, [Alerts](alerts.md) for alert type assignment, [Browser sources](browser-sources.md) for OBS setup, and [Troubleshooting](troubleshooting.md) if something does not appear.
