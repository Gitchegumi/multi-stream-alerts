# OAuth Provider Setup

GitchAlerts needs one Twitch developer application and one Google OAuth client for each deployed instance. The administrator creates these applications and stores their credentials in `.env`. Workspace owners then link their own Twitch or YouTube accounts from the dashboard. Those grants and tokens belong to the workspace connection, not to the deployment configuration.

## Before you begin

Set the public origins before registering either provider:

```env
NEXTAUTH_URL=https://alerts.example.com
PUBLIC_BASE_URL=https://alerts.example.com
INGRESS_PUBLIC_BASE_URL=https://alerts.example.com
```

`NEXTAUTH_URL` is the browser-facing dashboard origin. `INGRESS_PUBLIC_BASE_URL` is the publicly reachable webhook origin and falls back to `PUBLIC_BASE_URL` when omitted. Production provider URLs must use HTTPS. If the dashboard and ingress services share a domain, configure the reverse proxy to send `/api/auth/*` to the web service and `/api/webhooks/*` to the ingress service.

The resulting URLs are:

| Purpose                  | URL                                                                | Destination     |
| ------------------------ | ------------------------------------------------------------------ | --------------- |
| Twitch OAuth redirect    | `https://alerts.example.com/api/auth/callback/twitch`              | Web service     |
| Google OAuth redirect    | `https://alerts.example.com/api/auth/callback/google`              | Web service     |
| Twitch EventSub callback | `https://alerts.example.com/api/webhooks/twitch`                   | Ingress service |
| YouTube WebSub callback  | `https://alerts.example.com/api/webhooks/youtube/<workspace-slug>` | Ingress service |

Register the OAuth redirect URLs in the provider consoles. GitchAlerts creates the EventSub and WebSub callbacks automatically when a user connects an account; do not register them as OAuth redirect URLs.

## Twitch

### Create the application

1. Sign in to the [Twitch Developer Console](https://dev.twitch.tv/console/apps). Twitch requires the developer account to have a verified email address and two-factor authentication.
2. Open **Applications**, select **Register Your Application**, and enter a unique name.
3. Add this exact OAuth redirect URL, replacing the example origin with `NEXTAUTH_URL`:

   ```text
   https://alerts.example.com/api/auth/callback/twitch
   ```

4. Choose the category that best matches the deployment, then create the application.
5. Open **Manage** for the new application. Copy the **Client ID**, select **New Secret**, and copy the generated client secret. Creating another secret later invalidates the previous one.

Twitch does not have a separate EventSub callback field on this application form. GitchAlerts creates subscriptions through the Twitch API after a workspace owner connects an account. The generated callback is `INGRESS_PUBLIC_BASE_URL/api/webhooks/twitch`; it must be reachable over HTTPS on port 443 for Twitch's verification challenge.

### Permissions requested from linked channels

The administrator does not select these scopes in the Twitch console. GitchAlerts includes them in the authorization request, and each workspace owner approves them while connecting:

| Scope                        | Why GitchAlerts requests it                                    |
| ---------------------------- | -------------------------------------------------------------- |
| `openid`                     | Identifies the Twitch account through OpenID Connect.          |
| `user:read:email`            | Reads the account email address returned during authorization. |
| `moderator:read:followers`   | Creates `channel.follow` EventSub subscriptions.               |
| `channel:read:subscriptions` | Receives subscriptions and subscription gifts.                 |
| `bits:read`                  | Receives cheer events.                                         |
| `channel:read:charity`       | Receives charity donation events.                              |
| `channel:read:redemptions`   | Receives custom channel-point redemptions.                     |

Raid subscriptions do not require an additional user scope. If a future GitchAlerts release adds scopes, already-linked accounts display **Needs reconnect** until their owners approve the expanded request.

### Configure and verify Twitch

Add the credentials to `.env`:

```env
TWITCH_CLIENT_ID=<client-id-from-twitch>
TWITCH_CLIENT_SECRET=<client-secret-from-twitch>
```

Restart or recreate the web service so it reads the new environment. Then:

1. Sign in to GitchAlerts and open **Dashboard -> [workspace] -> Settings -> Integrations**.
2. Confirm the Twitch card no longer says **Unavailable**.
3. Select **Connect Twitch**, authorize the channel owner account, and return to GitchAlerts.
4. Confirm the card shows the linked account and a **Connected** badge. GitchAlerts generates the EventSub secret and provisions the supported subscriptions automatically.

## Google / YouTube

### Create and configure the project

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project for this GitchAlerts instance.
2. Go to **APIs & Services -> Library**, find **YouTube Data API v3**, and select **Enable**.
3. Open **Google Auth Platform -> Branding** and configure the app name, user support email, and developer contact email. Public deployments should also provide the requested homepage, privacy-policy, terms-of-service, and authorized-domain information.
4. Open **Google Auth Platform -> Audience**:
   - Choose **Internal** only when every linking user belongs to the same Google Workspace organization.
   - Otherwise choose **External**. While the app is in **Testing**, add every Google account that will link a YouTube channel as a test user.
5. Open **Google Auth Platform -> Data Access**, choose **Add or remove scopes**, and add these scopes:

   | Scope                                              | Why GitchAlerts requests it                                           |
   | -------------------------------------------------- | --------------------------------------------------------------------- |
   | `openid`                                           | Identifies the Google account.                                        |
   | `https://www.googleapis.com/auth/userinfo.email`   | Reads the account email returned by Google.                           |
   | `https://www.googleapis.com/auth/userinfo.profile` | Reads the account display profile.                                    |
   | `https://www.googleapis.com/auth/youtube.readonly` | Resolves the user's YouTube channel ID without modifying the channel. |

6. Open **Google Auth Platform -> Clients**, select **Create Client**, and choose **Web application**.
7. Add this exact **Authorized redirect URI**, replacing the example origin with `NEXTAUTH_URL`:

   ```text
   https://alerts.example.com/api/auth/callback/google
   ```

   An Authorized JavaScript origin is not required because GitchAlerts performs the OAuth exchange on the server.

8. Create the client and copy its client ID and client secret. Keep the secret private.

Google requires the redirect URI to match exactly, including scheme, host, port, path, case, and trailing slash. Production redirects must use HTTPS; localhost is the exception for local development.

### Testing, publishing, and verification

An External app in **Testing** is sufficient for initial or private testing, so Google verification is not required to prove the setup works. It has important limits:

- Only explicitly listed test users can authorize the app, up to 100 users.
- Because GitchAlerts requests `youtube.readonly` and offline access, a test user's grant and refresh token expire after seven days. The user must reconnect after expiry.
- A test user who manages a YouTube Brand Account can authorize that Brand Account.

Set the app to **In production** when users beyond the test-user list need access. `youtube.readonly` accesses private user data and appears as a sensitive scope in Google Auth Platform. An unverified production app can show an **unverified app** warning and is subject to Google's user cap. Complete Google's branding and data-access verification to remove those restrictions for a stable public deployment. Google may require verified domains, a privacy policy, a scope justification, and a video demonstrating the complete authorization flow.

An Internal app restricted to one Google Workspace organization normally does not need public-user verification, but it cannot be used by accounts outside that organization.

### Configure and verify YouTube

Add the credentials to `.env`:

```env
GOOGLE_CLIENT_ID=<client-id-from-google>
GOOGLE_CLIENT_SECRET=<client-secret-from-google>
```

Restart or recreate the web service, then:

1. Open **Dashboard -> [workspace] -> Settings -> Integrations** and confirm the YouTube card no longer says **Unavailable**.
2. Select **Connect YouTube** and sign in with an allowed Google account. In Testing mode, it must be on the test-user list.
3. Approve the requested access and return to GitchAlerts.
4. Confirm the linked channel appears and the card shows **Connected**. GitchAlerts resolves the channel ID and subscribes its feed to Google's WebSub hub automatically.

There is no WebSub callback setting in Google Cloud. For each workspace, GitchAlerts supplies `INGRESS_PUBLIC_BASE_URL/api/webhooks/youtube/<workspace-slug>` to the hub, and the worker renews the subscription before its lease expires.

## Configuration ownership

Keep the configuration layers separate:

| Layer                       | Managed by                 | Stored as                                | Examples                                                                               |
| --------------------------- | -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Instance OAuth applications | Self-hosting administrator | Deployment environment                   | `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Linked platform accounts    | Workspace owner or manager | Encrypted database records               | Provider account ID, access token, refresh token, token expiry                         |
| Generated webhook state     | GitchAlerts                | Encrypted per-workspace database records | Twitch EventSub secret, YouTube WebSub secret, provider subscription IDs               |

Do not copy a workspace owner's OAuth tokens into `.env`, and do not ask workspace owners for provider client secrets. Rotating an instance client secret requires updating `.env` and restarting the web service. Revoking or disconnecting an individual linked account affects only that account and its workspace subscriptions.

## Troubleshooting

- **The provider card says Unavailable:** both client variables for that provider must be present in the web service environment. Restart or recreate the service after editing `.env`.
- **The provider reports a redirect mismatch:** compare the registered URI with `NEXTAUTH_URL/api/auth/callback/twitch` or `NEXTAUTH_URL/api/auth/callback/google` character for character. Do not use `INGRESS_PUBLIC_BASE_URL` for OAuth redirects unless it is the same origin and routes `/api/auth/*` to the web service.
- **Twitch linking succeeds but the card says Needs reconnect:** confirm that the public EventSub callback is reachable through HTTPS on port 443, then reconnect to retry automatic provisioning.
- **Google says access is blocked or denied:** for an External app in Testing, add the connecting Google account under **Audience -> Test users**. For an Internal app, use an account in the configured organization.
- **YouTube needs reconnect every seven days:** this is expected for an External app in Testing that requests `youtube.readonly`. Publish and complete the applicable verification for durable public grants.
- **A callback cannot be verified:** confirm the reverse proxy sends `/api/webhooks/twitch` and `/api/webhooks/youtube/*` to the ingress service and that `INGRESS_PUBLIC_BASE_URL` is reachable from the public internet.

For provider-specific details, see Twitch's [application registration](https://dev.twitch.tv/docs/authentication/register-app/) and [EventSub webhook](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/) documentation, plus Google's [YouTube Data API overview](https://developers.google.com/youtube/v3/getting-started), [web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server), and [app audience](https://support.google.com/cloud/answer/15549945) documentation.
