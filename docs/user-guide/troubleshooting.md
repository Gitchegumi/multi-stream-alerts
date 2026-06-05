# Troubleshooting

## Alerts do not appear

- Confirm the canvas is active.
- Confirm the alert type is assigned to the selected canvas.
- Use **Test canvas** from the Alerts workspace.
- Refresh the browser source in your streaming app.

## Browser source is blank

- Check that the copied URL includes the display key.
- Confirm the deployment `PUBLIC_BASE_URL` matches the public site URL.
- Make sure the reverse proxy supports long-lived Server-Sent Events connections.

## Assets do not load

- Confirm the asset still exists in the Assets page.
- Check external URLs for hotlinking or HTTPS issues.
- For object storage, confirm bucket credentials and public/proxy access settings.
