/**
 * Shared routing logic for the linked-account "Connect" buttons.
 *
 * The UI displays a card per streaming platform (twitch, youtube). When
 * the platform is not yet linked it offers a Connect button that starts
 * the provider's OAuth flow via NextAuth `signIn`. Two concerns live here:
 *
 * 1. Platform → NextAuth provider slug mapping. YouTube links through the
 *    Google OAuth provider, so the platform ('youtube') and the provider
 *    ('google') differ. Getting this wrong sends `signIn` to a provider
 *    that does not exist, which NextAuth resolves by bouncing to the
 *    sign-in page (and, for an already-authenticated user, on to the
 *    dashboard — the "redirect to homepage" bug).
 *
 * 2. Instance availability. A provider's OAuth flow only exists when its
 *    env vars are configured. When they are not, the card must show a
 *    disabled/explanatory state instead of a button that leads nowhere.
 */

export type LinkPlatform = 'twitch' | 'youtube';
export type LinkProvider = 'twitch' | 'google';

/** Which platforms' OAuth flows are configured on this instance. */
export interface OAuthAvailability {
  twitch: boolean;
  youtube: boolean;
}

export type ConnectAction =
  | { kind: 'connect'; platform: LinkPlatform; provider: LinkProvider }
  | { kind: 'unavailable'; platform: LinkPlatform };

/** Map a streaming platform to its NextAuth OAuth provider slug. */
export function providerForPlatform(platform: LinkPlatform): LinkProvider {
  return platform === 'youtube' ? 'google' : 'twitch';
}

/** Whether a platform's OAuth flow is configured on this instance. */
export function isPlatformOAuthEnabled(
  platform: LinkPlatform,
  availability: OAuthAvailability,
): boolean {
  return platform === 'twitch' ? availability.twitch : availability.youtube;
}

/**
 * Resolve what a Connect button should do for a platform: start the OAuth
 * flow for the correct provider, or report that the flow is unavailable.
 */
export function resolveConnectAction(
  platform: LinkPlatform,
  availability: OAuthAvailability,
): ConnectAction {
  if (!isPlatformOAuthEnabled(platform, availability)) {
    return { kind: 'unavailable', platform };
  }
  return { kind: 'connect', platform, provider: providerForPlatform(platform) };
}
