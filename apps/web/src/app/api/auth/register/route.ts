import { NextResponse } from "next/server";
import { registerLocalUser } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

// SECURITY TODO: this endpoint runs bcrypt (cost 12 ≈ 250ms) plus two
// Prisma writes on every call. There is no per-IP or per-invite-code
// rate limit, so a caller with a valid invite code could attempt many
// guesses. Track follow-up work in the repo's issue tracker before
// exposing this on a public network. Suggested mitigations: per-IP
// rate limit (e.g. 5/min), CAPTCHA/honeypot, or signed invite links.
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "VALIDATION", message: "Invalid JSON body", field: undefined },
      { status: 400 }
    );
  }

  const result = await registerLocalUser(body);
  if (!result.ok) {
    const status = result.code === "LOCAL_REGISTRATION_DISABLED" ? 403 : 400;
    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result, { status: 201 });
}
