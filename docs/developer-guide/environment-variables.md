# Environment Variables

GitchAlerts is configured through a `.env` file at the repository root. Copy the committed example and fill in local values:

```bash
cp .env.example .env
```

Only `.env.example` is committed. Keep `.env` and any `.env.*.local` files private. The `.env` file holds instance plumbing, bootstrap values, and administrator-owned OAuth provider credentials. Ko-fi's verification token and the linked Twitch/YouTube accounts are managed per workspace in the dashboard under **Settings -> Integrations**.

## Public origins and ports

- `PUBLIC_BASE_URL`: externally reachable HTTPS origin used when generating browser-source and overlay links.
- `INGRESS_PUBLIC_BASE_URL`: public origin for the webhook ingress service.
- `NEXTAUTH_URL`: canonical dashboard origin used for auth callbacks. It must match the browser-facing origin you use to open the dashboard.
- `NEXT_PUBLIC_DOCS_URL`: optional external documentation URL shown in dashboard navigation. When unset, the dashboard links to the docs in this repository.
- `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`: operator identity and contact shown on the public privacy policy and terms pages. Set both before publishing an OAuth app or accepting public users.
- `WEB_PORT`: host port mapped to the web container (default `3000`).
- `INGRESS_PORT`: host port mapped to the ingress container (default `8080`).

## Data stores

- `DATABASE_URL`: PostgreSQL connection string.
- `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`: values used by the bundled PostgreSQL container.
- `REDIS_URL`: Redis connection string. Redis carries live alert events to browser sources.

## Asset storage

- `STORAGE_PROVIDER`: `local` (default) or `s3`.
- `APP_DATA_PATH`, `UPLOADS_PATH`, `UPLOAD_DIR`: host and container paths for local uploads. Keep `UPLOAD_DIR=/app/uploads` unless you also change the Compose mount.
- `DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES`, `MAX_UPLOAD_SIZE_BYTES`: per-workspace quota and per-file size limits.
- `ALLOWED_ASSET_MIME_TYPES`: comma-separated allowlist of uploadable MIME types.
- `SERVER_UPLOADS_ENABLED`, `NON_ADMIN_SERVER_UPLOADS_ENABLED`, `EXTERNAL_ASSET_URLS_ENABLED`: feature toggles for upload sources.
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`: required only when `STORAGE_PROVIDER=s3` (MinIO / AIStor and other S3-compatible backends).

## Authentication and onboarding

- `AUTH_SECRET`: Auth.js/NextAuth signing secret. This is the correct variable name; there is no `NEXTAUTH_SECRET`.
- `AUTH_OIDC_ENABLED`, `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, `AUTH_OIDC_CLIENT_SECRET`, `AUTH_OIDC_PROVIDER_NAME`: generic OIDC provider configuration. The app performs OIDC discovery against the issuer.
- `AUTH_CREDENTIALS_ENABLED`: enable the legacy local email/password invite path.
- `ONBOARDING_ENABLED`, `ONBOARDING_REQUIRE_INVITE`, `ONBOARDING_DEFAULT_WORKSPACE_ROLE`: onboarding policy for unknown OIDC users.
- `OIDC_ENROLLMENT_ENABLED`, `OIDC_ENROLLMENT_PROVIDER`, `OIDC_ENROLLMENT_URL`: optional external IdP enrollment redirect support.
- `INITIAL_ADMIN_EMAIL`: email of the first admin, recognized without an invite.

## Bootstrap defaults

- `DEFAULT_CHANNEL_SLUG`, `DEFAULT_CHANNEL_NAME`: seed the default channel workspace.
- `INITIAL_DISPLAY_KEY`: display key for the bootstrap `main` canvas. Set a long random value before first startup, then rotate keys from the dashboard.
- `ADMIN_KEY`: long random administrative key.

## Instance secrets

- `INSTANCE_ENCRYPTION_KEY`: base64-encoded 32-byte key that encrypts per-workspace platform credentials (Ko-fi, Twitch, YouTube) at rest. The app will not boot without it, and rotating it invalidates every stored secret.
- `ENCRYPTION_KEY`: separate secret (16+ characters) that encrypts OAuth tokens for linked Twitch and YouTube accounts. It must be consistent across the web app and workers.

Generate `INSTANCE_ENCRYPTION_KEY` once with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## Twitch / YouTube OAuth provider apps

Follow [Twitch and YouTube OAuth Setup](oauth-provider-setup.md) to create both applications, register the exact redirect URLs, and choose the appropriate Google publishing mode.

Twitch and YouTube are connected exclusively through OAuth — end users click **Connect** and the backend auto-provisions the EventSub / WebSub subscriptions. There are no per-workspace developer credential fields for these providers; the app-level credentials below are admin/deployment configuration.

- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`: the instance's Twitch application. Request the scopes the alert types require — `user:read:email`, `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, `channel:read:charity`, `channel:read:redemptions`. On connect the backend mints an app (client-credentials) token and creates one webhook EventSub subscription per supported type. Expanding scopes later invalidates existing links, which surface as **Needs reconnect**.
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: the instance's Google application with the YouTube Data API enabled and the `youtube.readonly` scope. On connect the backend resolves the channel id and subscribes to its feed on Google's WebSub hub.
- When these are unset, the corresponding Settings -> Integrations card shows an **Unavailable** state.
- The EventSub/WebSub callback URLs are derived from `INGRESS_PUBLIC_BASE_URL` (falling back to `PUBLIC_BASE_URL`), so that must be publicly reachable by the providers.
- `YOUTUBE_WEBSUB_RENEWAL_INTERVAL_MS` (default `3600000`) and `YOUTUBE_WEBSUB_RENEWAL_LEAD_MS` (default `86400000`): how often the worker sweeps for expiring WebSub leases and how far ahead of expiry it renews them.
