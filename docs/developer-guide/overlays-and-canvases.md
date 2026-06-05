# Overlays And Canvases

The user-facing model is canvas-first.

- `OverlayProfile` acts as the canvas/browser-source surface.
- `displayKey` authorizes browser-source access.
- `settingsJson` stores canvas settings such as size, background behavior, and assigned alert event keys.
- `WorkspaceAlertLayout` stores reusable visual/audio layout settings.
- `WorkspaceAlertConfig` stores per-channel alert type defaults.

The dashboard route `/dashboard/:channelSlug/alerts` presents canvases in the left panel, the selected browser-source URL and preview in the center, and alert type assignment in the right panel.

The public browser-source route is `/overlay/:channelSlug/:profileSlug?displayKey=...`.
Legacy bootstrap profiles can still use `/overlay/:profileSlug?displayKey=...`, but custom
canvases require the channel-scoped route.
