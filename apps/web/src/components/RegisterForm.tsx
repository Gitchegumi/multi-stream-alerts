'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { validateInviteCodeForCookie } from '@/lib/oidc-state';

type AuthMode = 'oidc' | 'credentials';

/**
 * Client-side registration form. OIDC onboarding stores the invite
 * code in a short-lived http-only cookie and then starts the IdP
 * round-trip. Credentials onboarding keeps the local email/password
 * registration path when that provider is enabled.
 */
export function RegisterForm({
  oidcEnabled,
  credentialsEnabled,
  inviteAccepted = false,
}: {
  oidcEnabled: boolean;
  credentialsEnabled: boolean;
  inviteAccepted?: boolean;
}) {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<AuthMode>(oidcEnabled ? 'oidc' : 'credentials');

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateInviteCodeForCookie(inviteCode);
    if (!validation.ok && !(mode === 'oidc' && inviteAccepted)) {
      setError(
        validation.reason === 'MISSING'
          ? 'Invite code is required.'
          : 'Invite code is not in a valid format.',
      );
      return;
    }

    if (mode === 'oidc') {
      startTransition(async () => {
        if (validation.ok) {
          const response = await fetch('/api/auth/signup', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ inviteCode: validation.inviteCode }),
          });

          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { message?: string };
            setError(data.message ?? 'Unable to continue with this invite code.');
            return;
          }
        }

        const signInResult = await signIn('oidc', {
          redirect: false,
          callbackUrl: '/dashboard',
        });

        if (signInResult?.error) {
          setError('Sign-in failed. Please try again.');
          return;
        }

        if (signInResult?.url) {
          window.location.href = signInResult.url;
          return;
        }

        router.push('/dashboard');
        router.refresh();
      });
      return;
    }

    if (!validation.ok) {
      setError('Invite code is required.');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    startTransition(async () => {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          inviteCode: validation.inviteCode,
          email: email.trim().toLowerCase(),
          password,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Registration failed. Please try again.');
        return;
      }

      const signInResult = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
        callbackUrl: '/dashboard',
      });

      if (signInResult?.error) {
        setError('Account created, but automatic sign-in failed. Please sign in manually.');
        return;
      }

      if (signInResult?.url) {
        window.location.href = signInResult.url;
        return;
      }

      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
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

      {!(mode === 'oidc' && inviteAccepted) && (
        <label className="auth-field">
          <span>Invite code</span>
          <input
            type="text"
            required
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
            disabled={pending}
            placeholder="ABCD-EFGH-JKLM"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
          />
        </label>
      )}

      {mode === 'credentials' && (
        <>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={pending}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
        </>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="button primary" disabled={pending}>
        {pending ? 'Working...' : mode === 'oidc' ? 'Continue to sign in' : 'Create account'}
      </button>

      <p className="muted small">
        {mode === 'oidc'
          ? 'You will be redirected to your identity provider to complete sign-in.'
          : 'Your account will be created immediately; no external identity provider is needed.'}
      </p>
    </form>
  );
}
