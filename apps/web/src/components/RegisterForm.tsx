'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { validateInviteCodeForCookie } from '@/lib/oidc-state';

/**
 * Client-side form for the first step of registration: paste the invite
 * code, validate it client-side, set a short-lived cookie via the
 * /api/auth/signup endpoint, then call next-auth `signIn("oidc")` which
 * redirects the browser to the configured OIDC provider.
 *
 * The cookie is the round-trip mechanism for the invite code: the
 * server-side `signIn` callback (apps/web/src/lib/auth.ts) reads and
 * clears it during the OIDC callback.
 */
export function RegisterForm() {
  const router = useRouter();
  const [inviteCode, setInviteCode] = useState('');
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

    startTransition(async () => {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ inviteCode: validation.inviteCode }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? 'Could not save invite code.');
        return;
      }
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
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? 'Working…' : 'Continue to sign in'}
      </button>
      <p className="muted small">
        After you continue, you will be redirected to your identity provider. Your first successful
        sign-in will create your account.
      </p>
    </form>
  );
}
