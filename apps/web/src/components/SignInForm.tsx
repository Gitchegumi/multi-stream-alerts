'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

/**
 * Renders the OIDC sign-in button. The sign-in path itself is identical
 * for both /signin (existing user) and /register (new user with a code);
 * the only thing that differs is the cookie set by /register, which the
 * server-side `signIn` callback reads.
 */
export function SignInForm({
  callbackUrl,
  initialError,
}: {
  callbackUrl?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = callbackUrl ?? searchParams.get('callbackUrl') ?? '/dashboard';

  const [error, setError] = useState<string | null>(
    initialError ? errorMessage(initialError) : null,
  );
  const [pending, startTransition] = useTransition();

  function handleSignIn() {
    setError(null);
    startTransition(async () => {
      const result = await signIn('oidc', { redirect: false, callbackUrl: target });
      if (result?.error) {
        setError(errorMessage(result.error));
        return;
      }
      // signIn with redirect:false still returns the URL; let next-auth
      // perform the actual navigation.
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      router.push(target);
      router.refresh();
    });
  }

  return (
    <div className="auth-form">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="button primary" onClick={handleSignIn} disabled={pending}>
        {pending ? 'Redirecting…' : 'Sign in with OIDC'}
      </button>
      <p className="muted small">
        You will be redirected to your identity provider to complete sign-in.
      </p>
    </div>
  );
}

function errorMessage(code: string): string {
  switch (code) {
    case 'AccessDenied':
      return 'Access denied. A valid invite code is required for first-time sign-in.';
    case 'OAuthAccountNotLinked':
      return 'This email is already associated with a different sign-in method.';
    case 'OAuthSignInError':
    case 'OAuthCallbackError':
      return 'Sign-in failed. Check your identity provider configuration.';
    default:
      return 'Sign-in failed. Please try again.';
  }
}
