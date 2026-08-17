type OAuthProfile = Record<string, unknown> | null | undefined;

/**
 * Return the human-readable identity supplied by an OAuth provider.
 * Provider payloads are not shaped consistently: Twitch commonly returns
 * `preferred_username` or `display_name`, while Google returns `name`.
 */
export function getPlatformAccountName(
  provider: 'twitch' | 'google',
  profile: OAuthProfile,
  providerAccountId: string,
): string | null {
  const fields =
    provider === 'twitch'
      ? ['display_name', 'preferred_username', 'login', 'name']
      : ['name', 'given_name', 'email'];

  for (const field of fields) {
    const value = profile?.[field];
    if (typeof value !== 'string') continue;
    const name = value.trim();
    if (name && name !== providerAccountId) return name;
  }

  return null;
}
