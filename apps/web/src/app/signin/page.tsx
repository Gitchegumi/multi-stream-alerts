import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SignInForm } from '@/components/SignInForm';
import { canUseRegisterPage, readOnboardingConfig } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? '/dashboard';
  const error = params.error;

  const credentialsEnabled = process.env.AUTH_CREDENTIALS_ENABLED === 'true';
  const oidcEnabled = process.env.AUTH_OIDC_ENABLED !== 'false';
  const onboarding = readOnboardingConfig();
  const registerAvailable = canUseRegisterPage({
    credentialsEnabled,
    oidcEnabled,
    onboardingEnabled: onboarding.enabled,
  });

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Sign in</h1>
        <p className="muted">Sign in with your identity provider to access the dashboard.</p>
        <SignInForm
          callbackUrl={callbackUrl}
          initialError={error}
          oidcEnabled={oidcEnabled}
          credentialsEnabled={credentialsEnabled}
        />
        {registerAvailable && (
          <p className="muted small">
            New here? <Link href="/register">Create an account with an invite code</Link>.
          </p>
        )}
      </section>
    </main>
  );
}
