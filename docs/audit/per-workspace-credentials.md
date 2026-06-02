# Per-Workspace Credentials — Audit Pass

Final audit of the `feat/per-workspace-credentials` branch (commits 75b7bb2..814dcda) before merge.

## Security guarantees verified

### No plaintext/ciphertext in logs
- All production `console.{log,info,warn,error}` calls reviewed.
- Web API: `console.info("credentials updated", { channelSlug, provider, userId, keysWritten, keysCleared })` and `console.info("credentials cleared", { channelSlug, provider, userId, key, all })` — key names only, never values.
- Webhook ingress: `console.info("kofi webhook accepted", { channelSlug, rawEventId })`, `console.info("twitch webhook accepted", { channelId })`, `console.info("youtube webhook accepted", { channelSlug, channelId })`. Rejections log opaque reason codes (`channel_not_found`, `not_configured`, `invalid_token`, `duplicate`, `no_matching_secret`).
- Database secrets module: `console.error` in dev only, message run through `redact()` from `secrets.ts`.
- Test files intentionally spy on `console.*` to assert the no-leak property.

### No plaintext/ciphertext in API responses
- `GET /api/channels/:slug/integrations/:provider` projects to the status shape explicitly. `getChannelCredentialStatus` never returns ciphertext; the handler re-projects to `{ configured, public, isEnabled }` as defense-in-depth.
- `PUT` returns the new status, never the saved values.
- `DELETE` returns 204 with no body.

### Authz
- `canManageChannelCredentials` (admin or channel owner) gates both PUT and DELETE.
- `canViewChannel` gates GET.

### Encryption at rest
- AES-256-GCM via Node `crypto`, 12-byte random IV per encryption.
- Key derived from `INSTANCE_ENCRYPTION_KEY` (32-byte base64) via `getInstanceEncryptionKey()`.
- Tamper detection via GCM auth tag. Decrypt throws `Error("Failed to decrypt secret: ...")` on any modification or malformed input.

## Test totals
- `packages/database`: 41/41 (secrets, integration-credentials, authz-credentials, invites)
- `apps/web`: 25/25 (route handlers, channel-slug, oidc-state)
- `apps/ingress`: 23/23 (kofi-webhook, twitch-webhook, youtube-webhook)

## Grep audit results
- No remaining references to removed env vars (`KOFI_VERIFICATION_TOKEN`, `TWITCH_EVENTSUB_SECRET`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `TWITCH_BROADCASTER_ID`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`).
- No remaining references to the old `IntegrationSetting` Prisma model.
- No deprecation paths in code; the old env vars and global webhook routes are deleted, not stubbed.

## Known follow-ups (out of scope for this branch)
- Twitch HMAC match-loop is O(N) per webhook. Fine for v1; revisit if channel count grows past a few hundred.
- YouTube Pub/Sub hub challenge verification and event normalization — the path-based URL is wired but the handler returns 501.
- Twitch event normalization — the auth path works but events are not yet turned into alert events.
