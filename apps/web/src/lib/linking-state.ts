/**
 * Shared utilities for OAuth account linking state.
 *
 * The linking flow stores the current user's ID in a short-lived signed
 * cookie before redirecting to the OAuth provider. The callback reads
 * the cookie and binds the linked account to that user.
 */

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'msa_linking_state';
const COOKIE_MAX_AGE = 600; // 10 minutes

function getSigningKey(): Uint8Array {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET or AUTH_SECRET must be set');
  }
  return new TextEncoder().encode(`msa-linking:${secret}`);
}

export async function createLinkingToken(userId: string): Promise<string> {
  return new SignJWT({ sub: userId, purpose: 'oauth-linking' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${COOKIE_MAX_AGE}s`)
    .sign(getSigningKey());
}

export async function verifyLinkingToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      clockTolerance: 30,
    });
    if (payload.purpose !== 'oauth-linking' || typeof payload.sub !== 'string') {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

/**
 * Peek at the linking cookie without consuming it.
 * Use in callbacks that need to know the linking user but shouldn't
 * delete the cookie yet (e.g. jwt callback before signIn).
 */
export async function peekLinkingUserId(): Promise<string | null> {
  const cookieJar = await cookies();
  const token = cookieJar.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyLinkingToken(token);
}

/**
 * Read and clear the linking state cookie, returning the user ID.
 * One-time use — safe to call from signIn callback.
 */
export async function consumeLinkingUserId(): Promise<string | null> {
  const userId = await peekLinkingUserId();
  if (userId) {
    const cookieJar = await cookies();
    cookieJar.delete(COOKIE_NAME);
  }
  return userId;
}

export function linkingCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  };
}
