import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { INVITE_CODE_COOKIE, INVITE_CODE_COOKIE_MAX_AGE_SECONDS } from '../oidc-state.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Whether the current request is served over a secure origin. Treats HTTPS
 * reverse-proxied traffic as secure by checking the standard `x-forwarded-proto`
 * header. This ensures invite cookies set by Authentik enrollment redirects
 * (which land on the public HTTPS domain via Nginx Proxy Manager) are marked
 * `secure=true` even when Next.js sees the internal HTTP connection.
 */
function isSecureRequest(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return false;
  }
  // Nginx Proxy Manager (and most reverse proxies) set x-forwarded-proto.
  // Next.js strips the `x-` prefix when exposing headers as env vars in edge/
  // serverless contexts, so check both forms.
  const forwardedProto =
    (typeof process !== 'undefined' && process.env.HTTP_X_FORWARDED_PROTO) ||
    (typeof process !== 'undefined' && process.env.X_FORWARDED_PROTO);
  if (forwardedProto === 'https') {
    return true;
  }
  // Fallback: NextAuth / the app requires a public base URL. If it is set and
  // starts with https://, assume production is served securely.
  const publicBase = process.env.NEXTAUTH_URL || process.env.PUBLIC_BASE_URL;
  if (publicBase?.startsWith('https://')) {
    return true;
  }
  return false;
}

export function buildInviteCookieOptions(inviteCode: string): ResponseCookie {
  return {
    name: INVITE_CODE_COOKIE,
    value: inviteCode,
    httpOnly: true,
    secure: isSecureRequest(),
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_CODE_COOKIE_MAX_AGE_SECONDS,
  };
}

test('buildInviteCookieOptions defaults secure=false in development', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  const opts = buildInviteCookieOptions('ABCD-EFGH');
  assert.equal(opts.secure, false);
  process.env.NODE_ENV = originalNodeEnv;
});

test('buildInviteCookieOptions sets secure=true in production with HTTPS base URL', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  process.env.NODE_ENV = 'production';
  process.env.NEXTAUTH_URL = 'https://alerts.example.com';
  const opts = buildInviteCookieOptions('ABCD-EFGH');
  assert.equal(opts.secure, true);
  process.env.NODE_ENV = originalNodeEnv;
  process.env.NEXTAUTH_URL = originalNextAuthUrl;
});

test('buildInviteCookieOptions falls back to PUBLIC_BASE_URL for secure check', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalPublicBase = process.env.PUBLIC_BASE_URL;
  process.env.NODE_ENV = 'production';
  delete (process.env as Record<string, string>).NEXTAUTH_URL;
  process.env.PUBLIC_BASE_URL = 'https://alerts.example.com';
  const opts = buildInviteCookieOptions('ABCD-EFGH');
  assert.equal(opts.secure, true);
  process.env.NODE_ENV = originalNodeEnv;
  process.env.NEXTAUTH_URL = originalNextAuthUrl;
  process.env.PUBLIC_BASE_URL = originalPublicBase;
});

test('buildInviteCookieOptions keeps secure=false when public URL is HTTP', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  process.env.NODE_ENV = 'production';
  process.env.NEXTAUTH_URL = 'http://alerts.example.com';
  const opts = buildInviteCookieOptions('ABCD-EFGH');
  assert.equal(opts.secure, false);
  process.env.NODE_ENV = originalNodeEnv;
  process.env.NEXTAUTH_URL = originalNextAuthUrl;
});
