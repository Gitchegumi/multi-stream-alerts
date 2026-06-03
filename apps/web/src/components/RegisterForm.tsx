'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { validateInviteCodeForCookie } from '@/lib/oidc-state';

/**
 * Client-side registration form. Collects invite code, email, and
 * password, then POSTs to /api/auth/register. On success, the user
 * is automatically signed in via credentials and redirected to the
 * dashboard.
 */
export function RegisterForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const validation = validateInviteCodeForCookie(inviteCode);
    if (!validation.ok) {
      setError(
        validation.reason === 'MISSING'
          ? 'Invite code is required.'
          : 'Invite code is not in a valid format.',
      );
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

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="button primary" disabled={pending}>
        {pending ? 'Working…' : 'Create account'}
      </button>

      <p className="muted small">
        Your account will be created immediately; no external identity provider is needed.
      </p>
    </form>
  );
}
