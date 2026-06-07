# Overlays And Canvases

The user-facing model is canvas-first.

- `OverlayProfile` acts as the canvas/browser-source surface.
- `displayKey` authorizes browser-source access.
- `settingsJson` stores the runtime canvas schema: size, background behavior, assigned alert event keys, default duration, ordered elements, fixed asset bindings, and canvas audio.
- `WorkspaceAlertConfig` stores per-channel alert type defaults.

The dashboard route `/dashboard/:channelSlug/alerts` presents canvases, layers/elements, variable tokens, the selected browser-source URL, a design preview, runtime preview, alert type assignment, and the selected element inspector.

The public browser-source route is `/overlay/:channelSlug/:profileSlug?displayKey=...`.
Legacy bootstrap profiles can still use `/overlay/:profileSlug?displayKey=...`, but custom
canvases require the channel-scoped route.

The browser-source route reads the saved canvas schema directly and renders only runtime elements.
It does not load dashboard controls. Alert events are filtered against the canvas `alertEventKeys`
assignment list before they enter the display queue.

Product direction: canvases are the primary editing and runtime unit. New editor work should attach
visual elements, stored media, audio, and alert bindings to the canvas schema.
