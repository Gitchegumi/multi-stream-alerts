import { NextResponse } from "next/server";
import { registerLocalUser } from "@/lib/local-auth";

export const dynamic = "force-dynamic";

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
