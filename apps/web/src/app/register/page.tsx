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
  searchParams: Promise<{ invite?: string; inviteReady?: string; error?: string }>;
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
    <main className="grid min-h-screen place-items-center [background:radial-gradient(circle_at_50%_0%,rgba(65,102,245,0.22),transparent_30rem),linear-gradient(180deg,#202126_0%,var(--bg)_100%)] p-6">
      <section className="grid w-[min(420px,100%)] gap-4 rounded-[10px] border border-line bg-panel p-7 shadow-brand">
        <h1 className="m-0 text-[28px] text-soft-white">Create an account</h1>
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
          inviteAccepted={params.inviteReady === '1'}
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
    case 'rateLimited':
      return 'Too many invite attempts. Try again shortly.';
    default:
      return 'This invite link could not be used. Ask an administrator for a new invite link.';
  }
}
