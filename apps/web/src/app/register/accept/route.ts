import { NextResponse } from 'next/server';
import {
  prisma,
  assertInviteIsUsable,
  InviteCodeError,
  decryptSecret,
} from '@multi-stream-alerts/database';
import { validateInviteCodeForCookie } from '@/lib/oidc-state';
import { buildInviteCookieOptions } from '@/lib/invite-cookie';
import {
  buildExternalEnrollmentRedirectUrl,
  isExternalEnrollmentExpired,
  readEnrollmentConfig,
  type EnrollmentConfig,
} from '@/lib/identity-provider-enrollment';

export const dynamic = 'force-dynamic';

type InviteRow = {
  id: string;
  code: string;
  usedCount: number;
  maxUses: number;
  isRevoked: boolean;
  expiresAt: Date | null;
  identityProviderInvite: {
    provider: string;
    externalToken: string;
    enrollmentUrl: string | null;
    expiresAt: Date | null;
  } | null;
};

export type InviteLinkDeps = {
  findInvite: (code: string) => Promise<InviteRow | null>;
  assertInviteIsUsable: typeof assertInviteIsUsable;
  enrollmentConfig: EnrollmentConfig;
  decryptExternalToken: (ciphertext: string) => string;
};

const defaultDeps: InviteLinkDeps = {
  findInvite(code) {
    return prisma.inviteCode.findUnique({
      where: { code },
      include: { identityProviderInvite: true },
    });
  },
  assertInviteIsUsable,
  enrollmentConfig: readEnrollmentConfig(),
  decryptExternalToken: decryptSecret,
};

export async function GET(request: Request) {
  return handleInviteLink(request, defaultDeps);
}

export async function handleInviteLink(
  request: Request,
  deps: InviteLinkDeps = defaultDeps,
): Promise<NextResponse> {
  const clientIp = getClientIp(request);
  if (isRateLimited(clientIp)) {
    return redirectToRegisterError(new URL(request.url), 'rateLimited');
  }

  const requestUrl = new URL(request.url);
  const inviteParam = requestUrl.searchParams.get('invite');
  const validation = validateInviteCodeForCookie(inviteParam);

  if (!validation.ok) {
    return redirectToRegisterError(requestUrl, 'invalidInvite');
  }

  const invite = await deps.findInvite(validation.inviteCode);
  if (!invite) {
    return redirectToRegisterError(requestUrl, 'invalidInvite');
  }

  try {
    deps.assertInviteIsUsable(invite);
  } catch (error) {
    if (error instanceof InviteCodeError) {
      return redirectToRegisterError(requestUrl, 'invalidInvite');
    }
    throw error;
  }

  if (deps.enrollmentConfig.enabled) {
    if (!invite.identityProviderInvite) {
      return redirectToRegisterError(requestUrl, 'missingEnrollment');
    }

    if (isExternalEnrollmentExpired(invite.identityProviderInvite)) {
      return redirectToRegisterError(requestUrl, 'expiredEnrollment');
    }

    let enrollmentUrl: URL;
    try {
      const externalToken = deps.decryptExternalToken(invite.identityProviderInvite.externalToken);
      enrollmentUrl = buildExternalEnrollmentRedirectUrl({
        identityProviderInvite: {
          ...invite.identityProviderInvite,
          externalToken,
        },
        config: deps.enrollmentConfig,
      });
    } catch {
      return redirectToRegisterError(requestUrl, 'missingEnrollment');
    }

    const response = NextResponse.redirect(enrollmentUrl);
    response.cookies.set(buildInviteCookieOptions(validation.inviteCode));
    return response;
  }

  const response = NextResponse.redirect(new URL('/register?inviteReady=1', requestUrl));
  response.cookies.set(buildInviteCookieOptions(validation.inviteCode));
  return response;
}

function redirectToRegisterError(requestUrl: URL, error: string) {
  return NextResponse.redirect(new URL(`/register?error=${error}`, requestUrl));
}

const rateLimitWindowMs = 60_000;
const maxAttemptsPerWindow = 10;
const acceptRateLimits = new Map<string, { count: number; resetAt: number }>();

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

function isRateLimited(clientIp: string): boolean {
  const now = Date.now();
  const existing = acceptRateLimits.get(clientIp);

  if (!existing || existing.resetAt <= now) {
    acceptRateLimits.set(clientIp, { count: 1, resetAt: now + rateLimitWindowMs });
    cleanupExpiredRateLimits(now);
    return false;
  }

  existing.count += 1;
  return existing.count > maxAttemptsPerWindow;
}

function cleanupExpiredRateLimits(now: number) {
  for (const [clientIp, limit] of acceptRateLimits) {
    if (limit.resetAt <= now) {
      acceptRateLimits.delete(clientIp);
    }
  }
}
