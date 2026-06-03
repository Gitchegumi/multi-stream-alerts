import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { RegisterForm } from '@/components/RegisterForm';
import { canUseRegisterPage, readOnboardingConfig } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function RegisterPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect('/dashboard');
  }

  const oidcEnabled = process.env.AUTH_OIDC_ENABLED !== 'false';
  const credentialsEnabled = process.env.AUTH_CREDENTIALS_ENABLED === 'true';
  const onboarding = readOnboardingConfig();

  if (
    !canUseRegisterPage({
      credentialsEnabled,
      oidcEnabled,
      onboardingEnabled: onboarding.enabled,
    })
  ) {
    redirect('/signin');
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <h1 className="auth-title">Create an account</h1>
        <p className="muted">Registration requires a valid invite code from an administrator.</p>
        <RegisterForm oidcEnabled={oidcEnabled} credentialsEnabled={credentialsEnabled} />
        <p className="muted small">
          Already have an account? <Link href="/signin">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}
