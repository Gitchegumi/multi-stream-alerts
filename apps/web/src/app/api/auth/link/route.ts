/**
 * API route to initiate OAuth account linking.
 *
 * Stores the current user's ID in a short-lived signed cookie, then
 * redirects to NextAuth's signin endpoint for the given provider.
 * The OAuth callback reads the cookie and binds the linked account
 * to the stored user, not the OAuth profile's email.
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

  // Verify the caller is authenticated
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET });
  if (!token?.sub) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const linkingToken = await createLinkingToken(token.sub as string);
  const callbackUrl = `/dashboard/settings/integrations?connected=${provider === 'google' ? 'youtube' : provider}`;
  const response = NextResponse.redirect(
    `/api/auth/signin/${provider}?callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );

  const opts = linkingCookieOptions();
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
