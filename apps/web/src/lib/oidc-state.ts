/**
 * Helpers for threading an invite code through the OIDC sign-in round-trip.
 *
 * The NextAuth v4 `signIn` callback does not receive the OIDC `state`
 * query parameter, so we cannot piggyback on it. Instead we stash the
 * invite code in a short-lived, http-only cookie set by the `/register`
 * page, then read and clear it inside the auth callback in
 * `apps/web/src/lib/auth.ts`.
 *
 * Cookie properties:
 *   - httpOnly: not readable from JavaScript
 *   - secure:   sent only over HTTPS in production
 *   - sameSite: lax so the OIDC callback (which is a top-level
 *               navigation) carries it
 *   - path:     "/" so the callback route can read it
 *   - maxAge:   10 minutes (long enough for the user to complete OIDC
 *               and return; short enough to limit replay)
 */
export const INVITE_CODE_COOKIE = "ga_signup_invite";

export const INVITE_CODE_COOKIE_MAX_AGE_SECONDS = 10 * 60;

/**
 * Maximum bytes of invite code we will set in the cookie. Our invite
 * generator tops out at 64 characters; 512 leaves a comfortable margin
 * for any future expansion.
 */
export const MAX_INVITE_CODE_BYTES = 512;

export type InviteCodeCookieValidation =
  | { ok: true; inviteCode: string }
  | { ok: false; reason: "MISSING" | "MALFORMED" | "TOO_LONG" };

export function validateInviteCodeForCookie(raw: string | null | undefined): InviteCodeCookieValidation {
  if (!raw) {
    return { ok: false, reason: "MISSING" };
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, reason: "MISSING" };
  }
  if (Buffer.byteLength(trimmed, "utf8") > MAX_INVITE_CODE_BYTES) {
    return { ok: false, reason: "TOO_LONG" };
  }
  // Mirror the normalizer used by `findInviteByCode` so the value the
  // callback sees is in the same shape the database stores.
  const normalized = trimmed.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (!normalized) {
    return { ok: false, reason: "MALFORMED" };
  }
  return { ok: true, inviteCode: normalized };
}
