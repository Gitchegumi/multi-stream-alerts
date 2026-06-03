'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

type AuthMode = 'oidc' | 'credentials';

/**
 * Renders the sign-in form with support for both OIDC and
 * email/password (credentials) authentication. A toggle switches
 * between the two modes, but only when credentials are enabled.
 */
export function SignInForm({
  callbackUrl,
  initialError,
  oidcEnabled = true,
  credentialsEnabled,
}: {
  callbackUrl?: string;
  initialError?: string;
  oidcEnabled?: boolean;
  credentialsEnabled?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const target = callbackUrl ?? searchParams.get('callbackUrl') ?? '/dashboard';

  const [mode, setMode] = useState<AuthMode>(oidcEnabled ? 'oidc' : 'credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      if (result?.url) {
        window.location.href = result.url;
        return;
      }
      router.push(target);
      router.refresh();
    });
  }

  function handleCredentialsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
        callbackUrl: target,
      });
      if (result?.error) {
        setError('Invalid email or password.');
        return;
      }
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

      {oidcEnabled && credentialsEnabled && (
        <div className="auth-mode-toggle" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'oidc'}
            className={mode === 'oidc' ? 'active' : ''}
            onClick={() => {
              setMode('oidc');
              setError(null);
            }}
            disabled={pending}
          >
            OIDC
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'credentials'}
            className={mode === 'credentials' ? 'active' : ''}
            onClick={() => {
              setMode('credentials');
              setError(null);
            }}
            disabled={pending}
          >
            Email & Password
          </button>
        </div>
      )}

      {mode === 'oidc' && oidcEnabled ? (
        <>
          <button
            type="button"
            className="button primary"
            onClick={handleSignIn}
            disabled={pending}
          >
            {pending ? 'Redirecting…' : 'Sign in with OIDC'}
          </button>
          <p className="muted small">
            You will be redirected to your identity provider to complete sign-in.
          </p>
        </>
      ) : credentialsEnabled ? (
        <form onSubmit={handleCredentialsSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="you@example.com"
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              placeholder="••••••••"
            />
          </label>
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      ) : null}
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
