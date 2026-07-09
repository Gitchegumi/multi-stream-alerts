# Environment Variables

GitchAlerts is configured through a `.env` file at the repository root. Copy the committed example and fill in local values:

```bash
cp .env.example .env
```

Only `.env.example` is committed. Keep `.env` and any `.env.*.local` files private. The `.env` file is for instance plumbing and bootstrap values only. Ko-fi, Twitch, and YouTube platform credentials are configured per workspace in the dashboard under **Settings -> Integrations**, not here.

## Public origins and ports

- `PUBLIC_BASE_URL`: externally reachable HTTPS origin used when generating browser-source and overlay links.
- `INGRESS_PUBLIC_BASE_URL`: public origin for the webhook ingress service.
- `NEXTAUTH_URL`: canonical dashboard origin used for auth callbacks. It must match the browser-facing origin you use to open the dashboard.
- `NEXT_PUBLIC_DOCS_URL`: optional external documentation URL shown in dashboard navigation. When unset, the dashboard links to the docs in this repository.
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

## Optional OAuth account linking

- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`: instance-level provider credentials that enable the OAuth connect/disconnect cards on the Settings -> Integrations page. When unset, those cards show a disabled state and the per-workspace manual credential fields remain available.
