import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { RegisterForm } from '@/components/RegisterForm';
import { canUseRegisterPage, readOnboardingConfig } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; inviteReady?: string; code?: string; error?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    redirect('/dashboard');
  }

  const params = await searchParams;
  if (params.invite) {
    redirect(`/register/accept?invite=${encodeURIComponent(params.invite)}`);
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
        {params.inviteReady && (
          <p className="muted small">Invite accepted. Continue to sign in when you are ready.</p>
        )}
        {params.error && (
          <p className="error" role="alert">
            {registerErrorMessage(params.error)}
          </p>
        )}
        <RegisterForm
          oidcEnabled={oidcEnabled}
          credentialsEnabled={credentialsEnabled}
          initialInviteCode={params.code}
        />
        <p className="muted small">
          Already have an account? <Link href="/signin">Sign in</Link>.
        </p>
      </section>
    </main>
  );
}

function registerErrorMessage(error: string) {
  switch (error) {
    case 'missingEnrollment':
      return 'This invite is missing external enrollment configuration. Ask an administrator for a new invite link.';
    case 'expiredEnrollment':
      return 'This external enrollment link has expired. Ask an administrator for a new invite link.';
    case 'invalidInvite':
      return 'This invite code is invalid, expired, revoked, or already exhausted.';
    default:
      return 'This invite link could not be used. Ask an administrator for a new invite link.';
  }
}
