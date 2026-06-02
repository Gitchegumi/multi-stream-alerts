import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { SignInForm } from "@/components/SignInForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect("/dashboard");
  }

  const localEnabled = process.env.ENABLE_LOCAL_REGISTRATION === "true";

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Create an account</h1>
        <p className="muted">
          Registration requires a valid invite code from an administrator. Once your account is created, you will have
          a personal workspace ready to use.
        </p>
        {!localEnabled ? (
          <p className="error">Local registration is currently disabled on this instance.</p>
        ) : (
          <SignInForm callbackUrl="/dashboard" mode="register" />
        )}
        <p className="muted small">
          Already have an account? <a href="/signin">Sign in</a>.
        </p>
      </section>
    </main>
  );
}
