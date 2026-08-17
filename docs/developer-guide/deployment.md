# Deployment

The project supports Docker-style deployment with PostgreSQL, Redis, object storage, and a reverse proxy.

Deployment notes:

- Set `PUBLIC_BASE_URL` to the externally reachable HTTPS origin.
- Configure the reverse proxy for WebSocket-like long-lived HTTP behavior for Server-Sent Events.
- Persist PostgreSQL, Redis as appropriate, and asset storage.
- Keep `INSTANCE_ENCRYPTION_KEY`, provider secrets, and NextAuth secrets stable across restarts.
- Create the instance-level Twitch and Google applications using [Twitch and YouTube OAuth Setup](oauth-provider-setup.md).
- For TrueNAS or similar platforms, mount persistent volumes for database and local asset data.
