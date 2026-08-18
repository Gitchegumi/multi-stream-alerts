# Canvases

A canvas is the streamable surface that appears in OBS, Streamlabs, Twitch Studio, or another streaming tool. Each canvas has a stable browser-source URL.

From **Alerts**, you can:

- Create a canvas.
- Select a canvas from the left panel.
- Add text, alert message, event image, and shape layers.
- Enter multiline text exactly as it should appear in the canvas and browser source. Spaces and line breaks are preserved.
- Select part of a text or alert-message layer in the **Content** field, then use **Selection color** to highlight names, amounts, tiers, or other event variables independently from the rest of the message.
- Pick stored image or video assets for media layers. Supported visual formats are PNG, JPG, GIF, WebP, SVG, MP4, and WebM. Animated GIF/WebP and video assets play automatically in the editor preview, test alerts, and the browser source. For video assets, use the element inspector to mute the video's audio track or set its volume independently from the canvas sound asset.
- Pick stored audio for the canvas and adjust volume.
- Select layers and adjust position, size, visibility, lock state, opacity, and text variables.
- Rename a canvas.
- Duplicate a canvas.
- Delete a canvas when more than one exists.
- Set width, height, background behavior, and active status.
- Assign alert types to the selected canvas.
- Copy the browser-source URL and use it in OBS or another browser-source-capable app.
- Send a test alert from the editor and inspect the runtime browser-source preview.

Inline color remains attached to an event variable when a test or live alert replaces a token such as `{{viewerName}}` or `{{amount}}`. The **Default color** setting controls text that does not have a selection color.

Transparent backgrounds are recommended for production browser sources. Dark background is useful for previewing transparent content in the dashboard.

Canvases are the overlay surfaces you use in OBS. The main editor workflow is canvas-first: place
elements, attach media, assign alert types, and copy the browser-source URL from the selected canvas.
