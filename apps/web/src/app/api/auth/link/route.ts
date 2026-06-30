/**
 * API route to initiate OAuth account linking.
 *
 * Stores the current user's ID in a short-lived signed cookie, then
 * returns a status payload. The client component calls NextAuth's
 * signIn(provider) directly (POST) to seamlessly redirect to the
 * OAuth provider without an intermediate sign-in page.
 */

import { getToken } from 'next-auth/jwt';
import { NextRequest, NextResponse } from 'next/server';
import { createLinkingToken, linkingCookieOptions } from '@/lib/linking-state';

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

  const linkingToken = await createLinkingToken(userId);
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
