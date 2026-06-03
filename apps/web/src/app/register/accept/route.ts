import { NextResponse } from 'next/server';
import { prisma, assertInviteIsUsable, InviteCodeError } from '@multi-stream-alerts/database';
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
};

export async function GET(request: Request) {
  return handleInviteLink(request, defaultDeps);
}

export async function handleInviteLink(
  request: Request,
  deps: InviteLinkDeps = defaultDeps,
): Promise<NextResponse> {
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
      enrollmentUrl = buildExternalEnrollmentRedirectUrl({
        identityProviderInvite: invite.identityProviderInvite,
        config: deps.enrollmentConfig,
      });
    } catch {
      return redirectToRegisterError(requestUrl, 'missingEnrollment');
    }

    const response = NextResponse.redirect(enrollmentUrl);
    response.cookies.set(buildInviteCookieOptions(validation.inviteCode));
    return response;
  }

  const continueUrl = new URL('/register', requestUrl);
  continueUrl.searchParams.set('inviteReady', '1');
  continueUrl.searchParams.set('code', validation.inviteCode);
  const response = NextResponse.redirect(continueUrl);
  response.cookies.set(buildInviteCookieOptions(validation.inviteCode));
  return response;
}

function redirectToRegisterError(requestUrl: URL, error: string) {
  return NextResponse.redirect(new URL(`/register?error=${error}`, requestUrl));
}
