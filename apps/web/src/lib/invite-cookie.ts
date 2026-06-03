import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { INVITE_CODE_COOKIE, INVITE_CODE_COOKIE_MAX_AGE_SECONDS } from './oidc-state';

export function buildInviteCookieOptions(inviteCode: string): ResponseCookie {
  return {
    name: INVITE_CODE_COOKIE,
    value: inviteCode,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_CODE_COOKIE_MAX_AGE_SECONDS,
  };
}
