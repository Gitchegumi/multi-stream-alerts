import type { ResponseCookie } from 'next/dist/compiled/@edge-runtime/cookies';
import { INVITE_CODE_COOKIE, INVITE_CODE_COOKIE_MAX_AGE_SECONDS } from '../oidc-state.ts';
import { isSecureRequest, buildInviteCookieOptions } from '../invite-cookie.ts';
import test from 'node:test';
import assert from 'node:assert/strict';

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

// isSecureRequest direct tests — imported from production module, not duplicated

test('isSecureRequest returns false in development', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  assert.equal(isSecureRequest(), false);
  process.env.NODE_ENV = originalNodeEnv;
});

test('isSecureRequest returns true with x-forwarded-proto: https', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalForwarded = process.env.X_FORWARDED_PROTO;
  process.env.NODE_ENV = 'production';
  process.env.X_FORWARDED_PROTO = 'https';
  assert.equal(isSecureRequest(), true);
  process.env.NODE_ENV = originalNodeEnv;
  process.env.X_FORWARDED_PROTO = originalForwarded;
});

test('isSecureRequest returns false without HTTPS signals in production', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalNextAuthUrl = process.env.NEXTAUTH_URL;
  const originalPublicBase = process.env.PUBLIC_BASE_URL;
  const originalForwarded = process.env.X_FORWARDED_PROTO;
  process.env.NODE_ENV = 'production';
  delete (process.env as Record<string, string>).NEXTAUTH_URL;
  delete (process.env as Record<string, string>).PUBLIC_BASE_URL;
  delete (process.env as Record<string, string>).X_FORWARDED_PROTO;
  assert.equal(isSecureRequest(), false);
  process.env.NODE_ENV = originalNodeEnv;
  if (originalNextAuthUrl) process.env.NEXTAUTH_URL = originalNextAuthUrl;
  if (originalPublicBase) process.env.PUBLIC_BASE_URL = originalPublicBase;
  if (originalForwarded) process.env.X_FORWARDED_PROTO = originalForwarded;
});
