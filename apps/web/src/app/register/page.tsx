import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";
import { RegisterForm } from "@/components/RegisterForm";
import { INVITE_CODE_COOKIE, validateInviteCodeForCookie } from "@/lib/oidc-state";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  // If a previous /register submission already set the invite cookie,
  // skip the code entry and go straight to OIDC. Otherwise show the
  // code-entry form.
  const cookieJar = await cookies();
  const existingCode = validateInviteCodeForCookie(cookieJar.get(INVITE_CODE_COOKIE)?.value);

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Create an account</h1>
        <p className="muted">
          Registration requires a valid invite code from an administrator. Once you enter it, you will be
          redirected to your identity provider; on your first sign-in we provision a personal workspace for you.
        </p>
        {existingCode.ok ? (
          <SignInForm callbackUrl="/dashboard" />
        ) : (
          <RegisterForm />
        )}
        <p className="muted small">
          Already have an account? <Link href="/signin">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
