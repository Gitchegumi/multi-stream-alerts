import { randomUUID } from 'node:crypto';

/**
 * Pure slug normalizer for a new user's personal channel.
 *
 * The user-portion is derived from the email's local-part and is
 * deterministic so the result is stable enough for URLs. A
 * cryptographically random suffix (randomUUID) is appended to make
 * collisions astronomically unlikely; callers must verify uniqueness
 * at create-time inside the same transaction (see
 * `createChannelWithUniqueSlug` in apps/web/src/lib/auth.ts).
 */
export function generateUniqueChannelSlugSync(email: string): string {
  const base =
    email
      .split('@')[0]
      ?.toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'user';
  // randomUUID() gives 36 chars of the form
  // "xxxxxxxx-xxxx-Mxxx-Nxxx-xxxxxxxxxxxx". We only need the first 8
  // hex chars to make a collision effectively impossible, and dropping
  // the dashes keeps the slug URL-friendly.
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  return `${base}-${suffix}`;
}
