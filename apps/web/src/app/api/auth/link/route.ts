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
import { prisma } from '@multi-stream-alerts/database';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  if (!provider || (provider !== 'twitch' && provider !== 'google')) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
  }

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

  // Optional channelId: when the linking flow starts from a workspace
  // Settings page, the client passes the channel slug so the linked
  // account is scoped to that workspace. We resolve the slug to a
  // channelId here so the JWT carries the DB ID, not the slug.
  let channelId: string | undefined;
  const channelSlug = searchParams.get('channelSlug');
  if (channelSlug) {
    const channel = await prisma.channel.findUnique({
      where: { slug: channelSlug },
      select: { id: true },
    });
    if (channel) {
      channelId = channel.id;
    }
  }

  const linkingToken = await createLinkingToken(userId, channelId);
  const opts = linkingCookieOptions();
  const response = NextResponse.json({ provider, ok: true });

  response.cookies.set({
    name: opts.name,
    value: linkingToken,
    httpOnly: opts.httpOnly,
    secure: opts.secure,
    sameSite: opts.sameSite,
    maxAge: opts.maxAge,
    path: opts.path,
  });

  return response;
}