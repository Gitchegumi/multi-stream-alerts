# GitchAlerts

GitchAlerts started from a simple frustration: I do not want my stream alerts, overlays, assets, and event history locked inside someone else’s platform. StreamElements may keep running, and third-party tools may work fine today, but the seed has already been planted. If a service can change direction, disappear, break features, restrict access, or hold my setup in a place I do not control, then I need a better option. GitchAlerts is my attempt to build that option: a self-hosted alert and overlay system that lets creators own their stream workflow instead of renting it from another platform.

It is built as a TypeScript monorepo with a Next.js dashboard/overlay app, a narrow public webhook ingress service, a small worker, PostgreSQL, Redis, and Docker Compose.

## What This Is

- A personal, self-hosted replacement path for StreamElements-style alerts.
- A dashboard for trusted users authenticated through OIDC.
- Display-key protected overlay pages for OBS or Meld browser sources.
- Provider adapters that normalize external events into one internal alert model.
- Docker Compose friendly and intended to sit behind a reverse proxy.

## What This Is Not

- Not a public SaaS product.
- Not public registration or public signup.
- Not billing or creator onboarding.
- Not username/password authentication inside the app.
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
ASSETS_PATH=/path/to/your/app/data/assets
WEB_PORT=3000
INGRESS_PORT=8080
```

`NEXTAUTH_URL` must match the browser-facing origin used to open the dashboard. For reverse proxy deployments, use `https://<your-alerts-domain>`. For local-only testing without a proxy, use the local origin you are opening in the browser.

Set `INITIAL_DISPLAY_KEY` to a long random value before first startup. The default `main` overlay profile uses that key. Additional default profile keys are generated at runtime in the database.

## Authentication Model

Dashboard routes require OIDC through Auth.js/NextAuth. Authentik is the first supported provider, while environment variable names are kept provider-neutral for future Keycloak support.

```env
AUTH_SECRET=<long-random-auth-secret>
AUTH_OIDC_ISSUER=https://<your-oidc-provider>/<issuer-path>
AUTH_OIDC_CLIENT_ID=<your-oidc-client-id>
AUTH_OIDC_CLIENT_SECRET=<your-oidc-client-secret>
ALLOW_AUTO_PROVISION=false
INITIAL_ADMIN_EMAIL=<your-admin-email>
```

For Authentik, set `AUTH_OIDC_ISSUER` to the canonical application issuer without a trailing slash, for example:

```env
AUTH_OIDC_ISSUER=https://<your-authentik-domain>/application/o/<application-slug>
```

The discovery URL `AUTH_OIDC_ISSUER/.well-known/openid-configuration` must return `200 OK` directly. If Authentik or your reverse proxy redirects from `http` to `https`, from an IP address to a host name, or to a path with different slash formatting, NextAuth will fail sign-in with `expected 200 OK, got: 301 Moved Permanently`.

The first admin is recognized by `INITIAL_ADMIN_EMAIL`. With `ALLOW_AUTO_PROVISION=false`, unknown OIDC users are denied dashboard access unless they already exist in the database.

Roles:

- `admin` can manage all channels.
- `owner` can manage owned channels.
- `editor` can edit assigned channel templates and overlays.
- `viewer` can view assigned dashboard content.

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
https://<your-alerts-domain>/api/webhooks/kofi
https://<your-alerts-domain>/api/webhooks/twitch
https://<your-alerts-domain>/api/webhooks/youtube
```

Webhook routes do not use OIDC. They must verify provider secrets/signatures and only ingest events.

## Docker Compose

Start the stack after configuring `.env`:

```bash
docker compose up --build
```

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
${ASSETS_PATH}:/app/assets
```

## Reverse Proxy

Route the public alerts domain to the containers:

```text
https://<your-alerts-domain>/              -> alerts-web:3000
https://<your-alerts-domain>/api/webhooks/ -> alerts-ingress:8080
```

App-level protections still apply even when routed through a reverse proxy.

## Ko-fi Setup

Configure the Ko-fi webhook URL:

```text
https://<your-alerts-domain>/api/webhooks/kofi
```

Set the matching token in `.env`:

```env
KOFI_VERIFICATION_TOKEN=<your-kofi-verification-token>
```

Ko-fi events are parsed from `application/x-www-form-urlencoded` payloads where `data` contains JSON. v1 maps events to the default channel from:

```env
DEFAULT_CHANNEL_SLUG=<default-channel-slug>
DEFAULT_CHANNEL_NAME=<default-channel-name>
```

Supported Ko-fi types:

- `Tip`
- `Subscription`
- `Commission`
- `Shop Order`

Duplicate Ko-fi `message_id` values are ignored. Private Ko-fi messages are not displayed in overlays.

## OBS or Meld Browser Source

Use the overlay URL shown in the dashboard for the profile you want:

```text
https://<your-alerts-domain>/overlay/main?displayKey=<valid-display-key>
```

Use a transparent browser source background. Overlay pages are full-screen, display-only, and do not expose dashboard controls.

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
https://<your-alerts-domain>/api/webhooks/kofi
```

The form field `data` should contain a JSON payload with a matching `verification_token`, a unique `message_id`, and a supported Ko-fi `type`.

## Known Limitations

- Twitch EventSub is stubbed with challenge/signature structure but does not yet normalize notifications.
- YouTube ingestion is stubbed and returns a future-implementation response.
- Template editing is a dashboard stub in v1.
- Overlay display key rotation is represented in the schema but does not yet have dashboard controls.
- The worker currently subscribes to Redis and logs normalized events for future queue processing.

## Roadmap

- Twitch EventSub subscription management and normalized alerts.
- YouTube Super Chat, membership, and live chat support.
- TikTok adapter research.
- Dashboard controls for templates, overlay settings, and display key rotation.
- Channel-specific provider integration settings.
- Asset management for alert sounds/images.
