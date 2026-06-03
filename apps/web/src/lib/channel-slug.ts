import { randomUUID } from 'node:crypto';
import type { Prisma } from '@multi-stream-alerts/database';

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

const MAX_CHANNEL_SLUG_ATTEMPTS = 5;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}

/**
 * Create a Channel row with a slug guaranteed to be unique in the
 * database, retrying on P2002 (unique-violation) collisions. Must be
 * called inside a `prisma.$transaction` so the `findUnique` + `create`
 * pair sees a consistent view of the channel table.
 */
export async function createChannelWithUniqueSlug(
  tx: Prisma.TransactionClient,
  preferredName: string,
  email: string,
  ownerUserId: string,
) {
  for (let attempt = 0; attempt < MAX_CHANNEL_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateUniqueChannelSlugSync(email);
    try {
      return await tx.channel.create({
        data: { name: preferredName, slug, ownerUserId },
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_CHANNEL_SLUG_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }
  // Unreachable: the loop either returns or throws on the last
  // iteration. Belt-and-suspenders to satisfy the type checker.
  throw new Error('channel slug collision retry exhausted');
}
