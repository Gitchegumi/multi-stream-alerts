/**
 * API route to initiate OAuth account linking.
 *
 * Stores the current user's ID (and optionally the channelId of the
 * workspace the link should be scoped to) in a short-lived signed
 * cookie, then returns a status payload. The client component calls
 * NextAuth's signIn(provider) directly (POST) to seamlessly redirect
 * to the OAuth provider without an intermediate sign-in page.
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { createLinkingToken, linkingCookieOptions } from '@/lib/linking-state';
import { canManageChannelCredentials, prisma } from '@multi-stream-alerts/database';

export type LinkHandlerDeps = {
  prisma: typeof prisma;
  canManageChannelCredentials: typeof canManageChannelCredentials;
  createLinkingToken: typeof createLinkingToken;
};

const defaultDeps: LinkHandlerDeps = {
  prisma,
  canManageChannelCredentials,
  createLinkingToken,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');

  // Verify the caller is authenticated and use our custom userId field
  // (not token.sub, which may be the OIDC provider subject for OIDC users).
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
  });
  const userId = token?.userId as string | undefined;
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const channelSlug = searchParams.get('channelSlug');
  const result = await handleStartOAuthLink({ provider, userId, channelSlug });
  if (result.status !== 200 || !result.linkingToken) {
    return NextResponse.json(result.body, { status: result.status });
  }

  const opts = linkingCookieOptions();
  const response = NextResponse.json(result.body);

  response.cookies.set({
    name: opts.name,
    value: result.linkingToken,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    maxAge: opts.maxAge,
    path: opts.path,
  });

  return response;
}

/**
 * Authorize link initiation against current database roles. The workspace is
 * mandatory so an OAuth grant can never bypass tenant authorization by
 * omitting the slug.
 */
export async function handleStartOAuthLink({
  provider,
  userId,
  channelSlug,
  deps = defaultDeps,
}: {
  provider: string | null;
  userId: string;
  channelSlug: string | null;
  deps?: LinkHandlerDeps;
}): Promise<{ status: number; body: unknown; linkingToken?: string }> {
  if (provider !== 'twitch' && provider !== 'google') {
    return { status: 400, body: { error: 'Invalid provider' } };
  }
  if (!channelSlug) {
    return { status: 400, body: { error: 'Missing workspace' } };
  }

  const [channel, user] = await Promise.all([
    deps.prisma.channel.findUnique({ where: { slug: channelSlug }, select: { id: true } }),
    deps.prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
  ]);
  if (!channel) {
    return { status: 404, body: { error: 'Workspace not found' } };
  }
  if (!user) {
    return { status: 401, body: { error: 'Unauthorized' } };
  }

  const canManage = await deps.canManageChannelCredentials(userId, user.role, channel.id);
  if (!canManage) {
    return { status: 403, body: { error: 'Forbidden' } };
  }

  const linkingToken = await deps.createLinkingToken(userId, channel.id);
  return { status: 200, body: { provider, ok: true }, linkingToken };
}
