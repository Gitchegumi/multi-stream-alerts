# Browser Sources

Every canvas exposes a browser-source URL at the top of the Alerts workspace.

To use it:

1. Copy the canvas URL.
2. Add a browser source in OBS or your streaming app.
3. Paste the URL.
4. Match the browser-source width and height to the canvas settings. If the source dimensions do not match, the alert can appear cropped, scaled, or positioned differently than it does in the canvas editor.
5. Refresh the source after changing assignments, canvas status, layout, media, or sizing. If the streaming app does not show the latest canvas changes, refresh the browser source first.

Canvas URLs do not open the dashboard and do not require a dashboard session. Keep the display key private because it grants read access to that canvas stream.

Videos with audio play automatically in browser-source environments that permit audible autoplay, including typical OBS browser-source configurations. A normal browser tab may initially block audible autoplay; GitchAlerts still starts the video muted so the visual remains visible, and restores its configured audio after the next click or key press in the page.
