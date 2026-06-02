import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Sign in</h1>
        <p className="muted">Sign in with your identity provider to access the dashboard.</p>
        <SignInForm callbackUrl={callbackUrl} initialError={error} />
        <p className="muted small">
          New here? <a href="/register">Create an account with an invite code</a>.
        </p>
      </section>
    </main>
  );
}
