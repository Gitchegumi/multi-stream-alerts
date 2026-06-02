import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import {
  INVITE_CODE_COOKIE,
  INVITE_CODE_COOKIE_MAX_AGE_SECONDS,
  validateInviteCodeForCookie
} from "@/lib/oidc-state";

export const dynamic = "force-dynamic";

const schema = z.object({
  inviteCode: z.string().trim().min(1)
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Invite code is required" }, { status: 400 });
  }

  const validation = validateInviteCodeForCookie(parsed.data.inviteCode);
  if (!validation.ok) {
    return NextResponse.json({ ok: false, message: "Invite code is not in a valid format" }, { status: 400 });
  }

  const cookieJar = await cookies();
  cookieJar.set({
    name: INVITE_CODE_COOKIE,
    value: validation.inviteCode,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: INVITE_CODE_COOKIE_MAX_AGE_SECONDS
  });

  return NextResponse.json({ ok: true });
}
