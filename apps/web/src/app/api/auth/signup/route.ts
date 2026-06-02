import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { z } from 'zod';
import {
  INVITE_CODE_COOKIE,
  INVITE_CODE_COOKIE_MAX_AGE_SECONDS,
  validateInviteCodeForCookie,
} from '@/lib/oidc-state';

export const dynamic = 'force-dynamic';

// Per-IP rate limit. Mirrors the pattern in
// apps/web/src/app/api/events/stream/route.ts; a TODO exists to
// extract this to a shared util. Limit is intentionally tighter than
// the stream route (10 / min vs 30 / min) because this endpoint is
// the invite-code enumeration vector: an attacker trying random
// codes can otherwise burn through valid single-use codes and
// observe which codes succeed by the presence/absence of the cookie.
const rateLimitWindowMs = 60_000;
const maxAttemptsPerWindow = 10;
const signupRateLimits = new Map<string, { count: number; resetAt: number }>();

const schema = z.object({
  inviteCode: z.string().trim().min(1),
});

/**
 * Sets a short-lived, http-only cookie that carries the invite code
 * through the OIDC round-trip. The server-side `signIn` callback
 * (apps/web/src/lib/auth.ts) reads and clears it.
 *
 * The endpoint exists as a server action's surface so we get a
 * straightforward way to write the cookie from a client component and
 * trigger a `router.refresh()` afterwards — letting next-auth's
 * `pages.signIn` machinery pick up the cookie on the next render.
 */
export async function POST(request: Request) {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { ok: false, message: 'Too many signup attempts, try again shortly' },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: 'Invite code is required' }, { status: 400 });
  }

  const validation = validateInviteCodeForCookie(parsed.data.inviteCode);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, message: 'Invite code is not in a valid format' },
      { status: 400 },
    );
  }

  const cookieJar = await cookies();
  cookieJar.set({
    name: INVITE_CODE_COOKIE,
    value: validation.inviteCode,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: INVITE_CODE_COOKIE_MAX_AGE_SECONDS,
  });

  return NextResponse.json({ ok: true });
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const existing = signupRateLimits.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    signupRateLimits.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    cleanupExpiredRateLimits(now);
    return false;
  }

  existing.count += 1;
  return existing.count > maxAttemptsPerWindow;
}

function cleanupExpiredRateLimits(now: number) {
  for (const [clientIp, limit] of signupRateLimits) {
    if (limit.resetAt <= now) {
      signupRateLimits.delete(clientIp);
    }
  }
}
