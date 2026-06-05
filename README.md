# GitchAlerts

GitchAlerts started from a simple frustration: I do not want my stream alerts, overlays, assets, and event history locked inside someone else’s platform. StreamElements may keep running, and third-party tools may work fine today, but the seed has already been planted. If a service can change direction, disappear, break features, restrict access, or hold my setup in a place I do not control, then I need a better option. GitchAlerts is my attempt to build that option: a self-hosted alert and overlay system that lets creators own their stream workflow instead of renting it from another platform.

It is built as a TypeScript monorepo with a Next.js dashboard/overlay app, a narrow public webhook ingress service, a small worker, PostgreSQL, Redis, and Docker Compose.

## What This Is

- A self-hosted alert and overlay system for creators and small teams.
- A dashboard for authenticated users, with role-based access.
- Display-key protected overlay pages for OBS or Meld browser sources.
- Provider adapters that normalize external events into one internal alert model.
- Docker Compose friendly and intended to sit behind a reverse proxy.

## What This Is Not

- Not a public SaaS product.
- Not billing or creator onboarding.
- Not dependent on Streamer.bot, StreamElements, or Streamlabs at runtime.

## Architecture

```text
apps/web       Next.js dashboard, overlay pages, dashboard APIs, and SSE
apps/ingress   Public webhook listener for provider callbacks
apps/worker    Redis subscriber and future queue/background job host
packages/shared
packages/ui
packages/database
```

PostgreSQL stores users, channels, memberships, alert history, templates, overlay profiles, integration metadata, and deduplication keys. Redis publishes normalized alert events from ingestion/manual tests to overlay clients.

## Configuration

Copy the example environment file and fill in local values:

```bash
cp .env.example .env
```

Only `.env.example` should be committed. Keep `.env`, `.env.local`, `.env.development`, and `.env.production` private.

Important deployment-specific values:

```env
PUBLIC_BASE_URL=https://<your-alerts-domain>
INGRESS_PUBLIC_BASE_URL=https://<your-alerts-domain>
NEXTAUTH_URL=https://<your-alerts-domain>
APP_DATA_PATH=/path/to/your/app/data
UPLOADS_PATH=/path/to/your/app/data/uploads
UPLOAD_DIR=/app/uploads
STORAGE_PROVIDER=local
WEB_PORT=3000
INGRESS_PORT=8080
GITCHALERTS_VERSION=v0.1.0
UPDATE_CHECK_ENABLED=true
UPDATE_CHECK_REPO=Gitchegumi/multi-stream-alerts
```

`NEXTAUTH_URL` must match the browser-facing origin used to open the dashboard. For reverse proxy deployments, use `https://<your-alerts-domain>`. For local-only testing without a proxy, use the local origin you are opening in the browser.

Set `INITIAL_DISPLAY_KEY` to a long random value before first startup. The default `main` overlay profile uses that key. Additional default profile keys are generated at runtime in the database. After startup, rotate display keys from the dashboard instead of editing environment variables.

### Instance-level environment variables

The `.env` file is for instance plumbing and bootstrap values only:

- Public origins and ports (`PUBLIC_BASE_URL`, `INGRESS_PUBLIC_BASE_URL`, `NEXTAUTH_URL`, `WEB_PORT`, `INGRESS_PORT`).
- Database, Redis, upload, and optional S3 storage settings.
- Auth/session/OIDC settings (`AUTH_SECRET`, `AUTH_OIDC_*`, onboarding flags, and `INITIAL_ADMIN_EMAIL`).
- Bootstrap defaults (`DEFAULT_CHANNEL_*`, `INITIAL_DISPLAY_KEY`) and the encryption-at-rest key (`INSTANCE_ENCRYPTION_KEY`).

Ko-fi, Twitch, and YouTube platform credentials are configured per workspace in the dashboard at **Settings -> Integrations**. They are encrypted at rest and are not sent to browser clients after save.

## Authentication Model

Dashboard routes require Auth.js/NextAuth. Authentication providers and onboarding policy are separate:

- Auth providers decide how a known user proves identity (`AUTH_OIDC_ENABLED`, `AUTH_CREDENTIALS_ENABLED`).
- Onboarding policy decides whether an unknown OIDC user may be provisioned (`ONBOARDING_ENABLED`, `ONBOARDING_REQUIRE_INVITE`, `ONBOARDING_DEFAULT_WORKSPACE_ROLE`).

OIDC is configured generically: set `AUTH_OIDC_ISSUER`, `AUTH_OIDC_CLIENT_ID`, and `AUTH_OIDC_CLIENT_SECRET` and the application will perform OIDC discovery against the issuer's well-known endpoint. This works with any OIDC-compliant provider (Authentik, Keycloak, Okta, Authing, Azure AD, Google, etc.).

```env
AUTH_SECRET=<long-random-auth-secret>
AUTH_OIDC_ENABLED=true
AUTH_OIDC_ISSUER=https://<your-oidc-provider>/<issuer-path>
AUTH_OIDC_CLIENT_ID=<your-oidc-client-id>
AUTH_OIDC_CLIENT_SECRET=<your-oidc-client-secret>
AUTH_CREDENTIALS_ENABLED=false
ONBOARDING_ENABLED=true
ONBOARDING_REQUIRE_INVITE=true
ONBOARDING_DEFAULT_WORKSPACE_ROLE=owner
OIDC_ENROLLMENT_ENABLED=false
# OIDC_ENROLLMENT_PROVIDER=authentik
# OIDC_ENROLLMENT_URL=https://<your-oidc-provider>/<enrollment-path>
INITIAL_ADMIN_EMAIL=<your-admin-email>
```

Defaults are OIDC enabled, credentials disabled, onboarding enabled, and invite-required onboarding. `AUTH_CREDENTIALS_ENABLED=true` enables the legacy local email/password invite registration path; when it is `false`, `/register` still supports OIDC invite onboarding.

For Authentik, set `AUTH_OIDC_ISSUER` to the canonical application issuer without a trailing slash, for example:

```env
AUTH_OIDC_ISSUER=https://<your-authentik-domain>/application/o/<application-slug>
```

The discovery URL `AUTH_OIDC_ISSUER/.well-known/openid-configuration` must return `200 OK` directly. If Authentik or your reverse proxy redirects from `http` to `https`, from an IP address to a host name, or to a path with different slash formatting, NextAuth will fail sign-in with `expected 200 OK, got: 301 Moved Permanently`.

The first admin is recognized by `INITIAL_ADMIN_EMAIL` and does not need an invite. Every other first-time OIDC sign-in follows the onboarding policy below.

Roles:

- `admin` can manage the instance, users, invite codes, and every channel.
- `owner` owns a channel and can manage its settings.
- `editor` can edit assigned channel templates and overlays.
- `viewer` can view assigned dashboard content.

### Invite-Gated Signup and OIDC Onboarding

In OIDC-first installs, users sign in through the configured identity provider, but GitchAlerts still controls app onboarding and workspace provisioning. To onboard a new user when invites are required, an admin generates an invite code; on first successful OIDC sign-in, the code is redeemed and the new user is provisioned with a personal channel.

```env
# Optional display name for the OIDC sign-in button (defaults to "OIDC").
# AUTH_OIDC_PROVIDER_NAME="Authentik"
```

#### Sign-up flow

1. Admin signs in with the email in `INITIAL_ADMIN_EMAIL` (still OIDC; no special first-time wizard).
2. Admin opens `/dashboard/admin/invites` and mints a new code (single-use or multi-use, with an optional role and expiration).
3. Admin shares the code with the new user out-of-band.
4. New user visits `/register`, pastes the code, and clicks **Continue to sign in**.
5. The browser sets a short-lived, http-only cookie carrying the code, then redirects to the configured OIDC provider.
6. The user authenticates with the IdP. On the OIDC callback, the server reads the cookie, redeems the code, creates the user, and provisions a personal channel in one transaction. The cookie is cleared immediately.

If the user is already a member, the OIDC callback just refreshes their last-known display name and signs them in — no invite code required.

The first admin is still created by signing in through OIDC with the email in `INITIAL_ADMIN_EMAIL`. That admin does **not** need an invite code.

#### Invite codes

- Created by admins at `/dashboard/admin/invites`.
- Each code has a role (defaults to `owner`), a `maxUses` count (default 1), and an optional `expiresAt` timestamp.
- A code can be revoked at any time. Revoked or expired codes are rejected at sign-in.
- Multi-use codes track per-user redemptions in `invite_code_redemptions` so a single user cannot burn a code's quota twice.
- Codes use a Crockford-style alphabet that drops lookalike characters (no `0`, `O`, `1`, `I`, `L`).

#### External IdP enrollment metadata

GitchAlerts invite codes are not the same thing as an Authentik invitation token. The GitchAlerts code remains the app-level invite and is the only code the user should receive. Optional external provider metadata can be linked to that invite, such as an Authentik `itoken`, so the admin sends only:

```text
/register?invite=<GITCHALERTS_CODE>
```

When `OIDC_ENROLLMENT_ENABLED=true`, opening that link validates the GitchAlerts invite, sets the short-lived app invite cookie, and redirects to the linked provider enrollment URL. For `OIDC_ENROLLMENT_PROVIDER=authentik`, GitchAlerts appends the stored external token as the `itoken` query parameter. The token is provider metadata; it is encrypted at rest with `INSTANCE_ENCRYPTION_KEY`, not shown to users, and not used as the GitchAlerts invite code.

Authentik enrollment flow setup is handled outside GitchAlerts for now. Create the Authentik invitation manually, paste its `itoken` into the GitchAlerts admin invite form, and optionally provide an enrollment URL override. A future enhancement may call the Authentik API automatically, but this implementation does not.

#### Invite-free onboarding

Set `ONBOARDING_REQUIRE_INVITE=false` to allow unknown OIDC users to be provisioned without an invite code. This is useful when your IdP already limits who can access the application. GitchAlerts still creates each new user with their own isolated channel; it does not add them to the initial admin/default workspace.

Set `ONBOARDING_ENABLED=false` to disable provisioning for unknown OIDC users entirely. Existing users can still sign in through enabled auth providers.

#### What the new user gets

A successful first OIDC sign-in creates:

- a `User` row keyed on `(authProvider, authSubject)` from the IdP,
- an `InviteCodeRedemption` row tying the user to the code they used, when an invite was supplied,
- a personal `Channel` whose `ownerUserId` is the new user, and
- a `ChannelMembership` granting the new user `owner` role on that channel.

`ONBOARDING_DEFAULT_WORKSPACE_ROLE` controls the new user's app role and defaults to `owner`. The personal channel membership is always `owner` so the user can manage their own workspace/channel. New onboarded users are not added to the initial admin/default workspace.

Users only see channels they are members of (or, for admins, every channel). Cross-user isolation is enforced by the existing `getAuthorizedChannels` and `canManageChannel` helpers.

#### First-time sign-in without an invite code

If `ONBOARDING_REQUIRE_INVITE=true` and a user attempts to sign in via OIDC without a valid invite cookie, and they are not the initial admin or an existing user, the `signIn` callback returns `false` and NextAuth redirects to `/signin?error=AccessDenied`. The user is never created and the IdP round-trip is harmless (no database side effects).

## Instance secrets

`INSTANCE_ENCRYPTION_KEY` is a 32-byte key (base64-encoded) used to encrypt per-channel platform credentials (Ko-fi verification token, Twitch EventSub secret / OAuth client credentials / broadcaster ID, YouTube OAuth client credentials) at rest in the database. The app will fail to boot without it — there is no fallback.

Generate it once when you first set up the instance:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Treat this key like a database root password: back it up somewhere safe. **Rotating the key invalidates every stored secret.** Existing ciphertext becomes unreadable, and every channel must re-enter its Ko-fi / Twitch / YouTube credentials from the dashboard. Plan rotations for known maintenance windows and store at least one historical copy until all channels have re-onboarded.

## Route Protection

Dashboard:

```text
https://<your-alerts-domain>/dashboard
```

Dashboard routes and dashboard API routes require OIDC.

Overlays:

```text
https://<your-alerts-domain>/overlay/main?displayKey=<valid-display-key>
https://<your-alerts-domain>/overlay/vertical?displayKey=<valid-display-key>
https://<your-alerts-domain>/overlay/test?displayKey=<valid-display-key>
```

Overlay routes do not use cookies or OIDC. They require a valid `displayKey`, scoped to one overlay profile and its channel.

Event stream:

```text
https://<your-alerts-domain>/api/events/stream?displayKey=<valid-display-key>
```

The SSE stream requires a valid display key and only emits events for that overlay profile's channel.

Webhooks:

```text
https://<your-alerts-domain>/api/webhooks/kofi/<your-channel-slug>
https://<your-alerts-domain>/api/webhooks/twitch
https://<your-alerts-domain>/api/webhooks/youtube/<your-channel-slug>
```

Webhook routes do not use OIDC. They must verify provider secrets/signatures and only ingest events. Ko-fi and YouTube webhooks include the channel slug in the path; Twitch uses a single global callback URL and identifies the channel by matching the inbound HMAC against stored per-channel `eventsubSecret` values.

All webhook validation uses per-workspace integration settings from the database. Platform tokens, OAuth client secrets, and EventSub secrets are never read from request-visible browser payloads and are not logged. Dashboard test alerts call the same `storeAndPublishAlertEvent` path used by real webhook alerts, so disabled or unmapped alert types are suppressed consistently.

## Alert Event Catalog and Layouts

Alert types and alert layouts are separate concepts. An alert type is the event that happened, such as `twitch.followed` or `youtube.superchat`. A layout is the reusable visual/audio presentation used when the event fires. One layout can be assigned to many alert types, and different alert types can use different layouts in the same workspace.

The global alert catalog is stored in `alert_event_types` and seeded during migrations/startup. Per-workspace activation and overrides live in `workspace_alert_configs`. Reusable workspace layouts live in `workspace_alert_layouts`. Existing vertical and horizontal presentations are default layout presets, not alert identities.

Supported catalog keys:

```text
YouTube:
youtube.tipped
youtube.superchat
youtube.subscribed
youtube.member
youtube.merch_purchased
youtube.widget_event

Twitch:
twitch.followed
twitch.subscribed
twitch.single_sub_gift
twitch.community_gift
twitch.cheered
twitch.tipped
twitch.raided
twitch.external_purchase
twitch.community_gifted_sub
twitch.hypechat
twitch.charity_donation
twitch.merch_purchased
twitch.redemption
twitch.widget_event

Ko-fi:
kofi.tipped
kofi.subscribed
kofi.commission
kofi.shop_order

Generic/API:
generic.widget_event

Manual:
manual.test
```

Workspace owners/admins/editors can configure alert types from the dashboard. Each alert type has an enabled flag, display-name override, assigned layout, optional message template, duration override, volume override, and test button. Disabled alert types are not stored or published. Unknown or unmapped incoming events are logged with opaque metadata and can fall back to the platform's `*.widget_event` handler or `generic.widget_event` when that handler is enabled.

Layouts can be created and edited independently. Each layout has a name, style (`vertical`, `horizontal`, `compact`, or `custom`), optional visual asset, optional sound asset, default duration, default volume, and preview button. Assets can come from the workspace asset library or from a direct URL fallback. Deleting a layout is blocked while active alert configs use it unless the request explicitly falls back those configs to the default layout first.

## Asset Storage

Uploaded media is never stored as large Postgres blobs. The database stores metadata, ownership, usage, and storage references in `workspace_assets`; bytes live in a storage backend.

Supported MVP sources:

- Local server storage, the default for self-hosted installs.
- S3-compatible storage such as MinIO or AIStor.
- User-managed external `http`/`https` asset URLs.

Supported uploaded types are PNG, JPEG, WebP, GIF, safely checked SVG, MP4, WebM, MP3, WAV, and OGG. Upload validation checks file extension and detected file signature where practical, enforces per-workspace quota and max file size, sanitizes original filenames, rejects path-like storage segments, and generates server-side storage names. Local, S3, and external URL assets are mediated through `/api/assets/:assetId/content`; dashboard sessions can preview them, and overlay browser sources must include a valid display key for the asset's workspace before bytes are served or external URLs are redirected.

Local storage example:

```env
STORAGE_PROVIDER=local
UPLOAD_DIR=/app/uploads
UPLOADS_PATH=/mnt/homelab/apps/gitchalerts/uploads
DEFAULT_WORKSPACE_STORAGE_QUOTA_BYTES=536870912
MAX_UPLOAD_SIZE_BYTES=52428800
SERVER_UPLOADS_ENABLED=true
NON_ADMIN_SERVER_UPLOADS_ENABLED=true
EXTERNAL_ASSET_URLS_ENABLED=true
```

In Docker Compose, mount `${UPLOADS_PATH}` to `/app/uploads`. On TrueNAS or another homelab host, keep that path on persistent storage, not inside the container filesystem.

S3-compatible storage example:

```env
STORAGE_PROVIDER=s3
S3_ENDPOINT=https://minio.example.com
S3_BUCKET=gitchalerts-assets
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
S3_FORCE_PATH_STYLE=true
```

The S3 mode uses ordinary SigV4 requests and works with path-style MinIO/AIStor deployments. The database still stores only metadata and object keys.

External URLs:

- Must be `http://` or `https://`.
- `file://` URLs are rejected for browser-source security.
- The app stores the URL and metadata but does not download or copy the file.
- The URL must be reachable by the OBS/Meld browser source; if it breaks, the alert asset breaks.

Raw local-machine file storage is intentionally not the MVP model. Browser `file://` references do not generalize to hosted dashboards or shared workspaces, and an OBS browser source usually cannot access another user's local files. A user-run local HTTP server can work when OBS can reach that machine, and a future desktop companion/local agent could sync or serve files, but those are separate features.

## Docker Compose

Start the stack after configuring `.env`:

```bash
docker compose up --build
```

For self-hosted production deployments, pin a readable release tag instead of
using `latest`:

```env
GITCHALERTS_VERSION=v0.1.0
```

Compose references the release-tagged GHCR images and still keeps local `build`
settings for development. Published images also include `sha-<shortsha>` tags
and OCI labels for release version, Git revision, source, title, and
description. See [Release and Container Versioning](docs/releases.md) for the
maintainer release process.

Services:

```text
alerts-web       host ${WEB_PORT:-3000} -> container 3000
alerts-ingress   host ${INGRESS_PORT:-8080} -> container 8080
alerts-worker    internal worker process
alerts-postgres  internal PostgreSQL
alerts-redis     internal Redis
```

Postgres and Redis are not exposed publicly. Host storage is configured with environment-variable bind mounts:

```yaml
${APP_DATA_PATH}/postgres:/var/lib/postgresql/data
${APP_DATA_PATH}/redis:/data
${UPLOADS_PATH}:/app/uploads
```

For TrueNAS, create a dataset such as `/mnt/<pool>/apps/gitchalerts`, then set `APP_DATA_PATH` to that dataset and `UPLOADS_PATH` to a child directory such as `/mnt/<pool>/apps/gitchalerts/uploads`. Do not point `UPLOADS_PATH` at a temporary directory or a path inside an image/container layer; local uploaded alert media lives there and must survive container rebuilds, app upgrades, and reboots. Keep `UPLOAD_DIR=/app/uploads` unless you also change the Compose mount target.

## Reverse Proxy

Route the public alerts domain to the containers:

```text
https://<your-alerts-domain>/              -> alerts-web:3000
https://<your-alerts-domain>/api/webhooks/ -> alerts-ingress:8080
```

App-level protections still apply even when routed through a reverse proxy.

## Ko-fi Setup

Configure platform credentials from the dashboard. The webhook URL pattern is shown below; the verification token is managed per-channel.

```text
https://<your-alerts-domain>/api/webhooks/kofi/<your-channel-slug>
```

Set the matching verification token in Dashboard → Settings → Integrations → Ko-fi. The token is stored encrypted at rest using `INSTANCE_ENCRYPTION_KEY`.

Supported Ko-fi types:

- `Tip`
- `Subscription`
- `Commission`
- `Shop Order`

Duplicate Ko-fi `message_id` values are ignored. Private Ko-fi messages are not displayed in overlays.

## Twitch Setup

Configure per-channel Twitch credentials from Dashboard → Settings → Integrations → Twitch. Each channel stores four fields:

- `eventsubSecret` — per-channel secret used to verify EventSub HMAC signatures. Generate a random 16+ character string; set this in your Twitch app's EventSub subscription callback URL settings **and** store it in the dashboard. The webhook handler matches inbound HMACs against stored secrets to identify the receiving channel.
- `clientId` / `clientSecret` — Twitch app OAuth credentials used to call the Twitch API (subscriptions, user lookups, etc.).
- `broadcasterId` — numeric user ID of the channel receiving the events. Find it via the Twitch API (`/users?login=<channel>`) or your Twitch dashboard.

The Twitch EventSub callback URL is global per app. The receiving channel is identified implicitly by which stored `eventsubSecret` validates the inbound HMAC — see `apps/ingress/src/twitch-webhook.ts`.

> **v1 stub:** EventSub subscription creation and event normalization are still future work; v1 verifies the HMAC and returns `501 Not Implemented`.

## YouTube Setup

Configure per-channel YouTube credentials from Dashboard → Settings → Integrations → YouTube. Each channel stores two fields:

- `clientId` — Google OAuth client ID for YouTube Data API access.
- `clientSecret` — Google OAuth client secret paired with the client ID.

The webhook URL is per-channel:

```text
https://<your-alerts-domain>/api/webhooks/youtube/<your-channel-slug>
```

> **v1 stub:** Pub/Sub hub challenge verification and Super Chat / membership event normalization are still future work; v1 verifies the URL resolution and returns `501 Not Implemented`.

## OBS or Meld Browser Source

Use the overlay URL shown in the dashboard for the profile you want:

```text
https://<your-alerts-domain>/overlay/main?displayKey=<valid-display-key>
```

Use a transparent browser source background. Overlay pages are full-screen, display-only, and do not expose dashboard controls.

## Overlay Setup

Overlay URLs are managed from the dashboard at **Dashboard → Overlay Profiles**. Each profile (e.g., `main`, `vertical`, `test`) has a dedicated overlay URL with a unique `displayKey`.

### Display keys

- A `displayKey` is a long random string scoped to one overlay profile and its channel.
- It grants **overlay-only access**: the browser source can connect to the SSE event stream and load assets for that same workspace, but it cannot open dashboard pages or act as a session.
- Display keys are **not** user passwords or OIDC tokens. They are separate credentials meant for OBS / Meld browser sources.

### Getting the overlay URL

1. Open the dashboard and select a channel.
2. Navigate to **Dashboard → Overlay Profiles**.
3. Copy the overlay URL for the profile you want (e.g., `main`).
4. Paste it into an OBS or Meld browser source.

### Rotating display keys

Rotating a display key is a **hard cutover**:

1. In **Dashboard → Overlay Profiles**, click **Rotate Key** for the profile.
2. The old key is immediately invalid. Existing browser sources will stop receiving events.
3. Copy the new overlay URL and update every browser source using the old one.

There is no grace period or dual-key window. Plan rotations around stream downtime or update sources quickly.

### Security model

- `displayKey` ≠ dashboard session auth. Knowing a display key does not grant dashboard access, and a dashboard session cookie is never accepted by overlay or SSE routes.
- Overlay routes validate the `displayKey` query parameter. SSE routes validate it and then filter events to the matching channel. Asset content routes also require either a dashboard session with channel access or a display key for the asset's channel.
- If a display key leaks, rotate it. The leaked key cannot be used to modify channel settings, view other channels, or access the dashboard.

## Testing

Run local validation:

```bash
pnpm install
pnpm prisma:generate
pnpm typecheck
pnpm --filter @multi-stream-alerts/web build
```

Manual alert test:

1. Start the stack with `docker compose up --build`.
2. Open `https://<your-alerts-domain>/dashboard`.
3. Sign in with the OIDC account matching `INITIAL_ADMIN_EMAIL`.
4. Open the dashboard-provided overlay URL in a browser source or browser tab.
5. Use the dashboard form to send a test alert.

Ko-fi webhook test:

Send a form-encoded POST to:

```text
https://<your-alerts-domain>/api/webhooks/kofi/<your-channel-slug>
```

The form field `data` should contain a JSON payload with a matching `verification_token` (the one stored in Dashboard → Settings → Integrations → Ko-fi for that channel), a unique `message_id`, and a supported Ko-fi `type`.

## Known Limitations

- Twitch EventSub is stubbed with challenge/signature structure but does not yet normalize notifications.
- YouTube ingestion is stubbed and returns a future-implementation response.
- Template editing is a dashboard stub in v1.
- The worker currently subscribes to Redis and logs normalized events for future queue processing.

## Roadmap

- Twitch EventSub subscription management and normalized alerts.
- YouTube Super Chat, membership, and live chat support.
- TikTok adapter research.
- Dashboard controls for templates and richer overlay settings.
- Richer admin UI for per-workspace quotas, asset allowlists, and signed URL policies.

## Hardening Changelog

- Asset content now authorizes dashboard sessions or workspace-scoped display keys before redirecting external asset URLs.
- Local upload storage rejects path-like workspace segments and continues to use generated server-side filenames.
- Overlay stream logs identify the channel/profile without logging any display-key material.
- The web test script is shell-neutral on Windows and POSIX shells.
- Deployment docs now clarify instance-level env vars, UI-managed platform credentials, display-key rotation, and persistent Docker/TrueNAS upload storage.
