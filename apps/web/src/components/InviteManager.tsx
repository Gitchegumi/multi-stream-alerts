'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

type CodeSummary = {
  id: string;
  code: string;
  role: 'admin' | 'owner' | 'editor' | 'viewer';
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  isRevoked: boolean;
  note: string | null;
  createdByUserId: string;
  createdAt: string;
  identityProviderInvite: {
    id: string;
    provider: string;
    enrollmentUrl: string | null;
    expiresAt: string | null;
    usedAt: string | null;
    createdAt: string;
  } | null;
};

type Redemption = {
  id: string;
  inviteCodeId: string;
  redeemedAt: string;
  user: { email: string; displayName: string | null };
};

const ROLES: CodeSummary['role'][] = ['admin', 'owner', 'editor', 'viewer'];

function statusLabel(code: CodeSummary): { label: string; tone: 'ok' | 'warn' | 'muted' } {
  if (code.isRevoked) return { label: 'Revoked', tone: 'warn' };
  if (code.expiresAt && new Date(code.expiresAt).getTime() <= Date.now()) {
    return { label: 'Expired', tone: 'muted' };
  }
  if (code.usedCount >= code.maxUses) return { label: 'Exhausted', tone: 'muted' };
  if (code.usedCount > 0) return { label: `${code.usedCount}/${code.maxUses} used`, tone: 'ok' };
  return { label: 'Unused', tone: 'ok' };
}

export function InviteManager({
  initialCodes,
  initialRedemptions,
}: {
  initialCodes: CodeSummary[];
  initialRedemptions: Redemption[];
}) {
  const router = useRouter();
  const [codes, setCodes] = useState(initialCodes);
  const [redemptions] = useState(initialRedemptions);
  const [role, setRole] = useState<CodeSummary['role']>('owner');
  const [maxUses, setMaxUses] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [note, setNote] = useState('');
  const [externalProvider, setExternalProvider] = useState('');
  const [externalToken, setExternalToken] = useState('');
  const [externalEnrollmentUrl, setExternalEnrollmentUrl] = useState('');
  const [externalExpiresAt, setExternalExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          role,
          maxUses: Math.max(1, Math.floor(maxUses)),
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
          note: note.trim() || undefined,
          identityProviderInvite:
            externalProvider.trim() || externalToken.trim()
              ? {
                  provider: externalProvider.trim().toLowerCase(),
                  externalToken: externalToken.trim(),
                  enrollmentUrl: externalEnrollmentUrl.trim() || undefined,
                  expiresAt: externalExpiresAt
                    ? new Date(externalExpiresAt).toISOString()
                    : undefined,
                }
              : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        code?: CodeSummary;
        error?: string;
      };
      if (!response.ok || !data.code) {
        setError(data.error ?? 'Failed to create invite code.');
        return;
      }
      setCodes((current) => [
        {
          ...data.code!,
          expiresAt: data.code!.expiresAt ? new Date(data.code!.expiresAt).toISOString() : null,
          createdAt: new Date(data.code!.createdAt).toISOString(),
          identityProviderInvite: data.code!.identityProviderInvite
            ? {
                ...data.code!.identityProviderInvite,
                expiresAt: data.code!.identityProviderInvite.expiresAt
                  ? new Date(data.code!.identityProviderInvite.expiresAt).toISOString()
                  : null,
                usedAt: data.code!.identityProviderInvite.usedAt
                  ? new Date(data.code!.identityProviderInvite.usedAt).toISOString()
                  : null,
                createdAt: new Date(data.code!.identityProviderInvite.createdAt).toISOString(),
              }
            : null,
        },
        ...current,
      ]);
      setExpiresAt('');
      setNote('');
      setExternalProvider('');
      setExternalToken('');
      setExternalEnrollmentUrl('');
      setExternalExpiresAt('');
      router.refresh();
    });
  }

  function handleRevoke(id: string) {
    startTransition(async () => {
      const response = await fetch('/api/admin/invites', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error ?? 'Failed to revoke invite code.');
        return;
      }
      const data = (await response.json()) as { code: CodeSummary };
      setCodes((current) =>
        current.map((c) => (c.id === id ? { ...c, isRevoked: data.code.isRevoked } : c)),
      );
      router.refresh();
    });
  }

  return (
    <section className="grid" style={{ gridTemplateColumns: '1fr', gap: 16, marginTop: 24 }}>
      <div className="panel">
        <h2>Create a new invite code</h2>
        <form className="auth-form" onSubmit={handleCreate}>
          <div className="auth-field">
            <span>Role</span>
            <select
              className="select"
              value={role}
              onChange={(e) => setRole(e.target.value as CodeSummary['role'])}
              disabled={pending}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="auth-field">
            <span>Max uses</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={maxUses}
              onChange={(e) => setMaxUses(Number(e.target.value))}
              disabled={pending}
            />
          </div>
          <div className="auth-field">
            <span>Expires (optional)</span>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="auth-field">
            <span>Note (optional)</span>
            <input
              type="text"
              maxLength={200}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. for a friend testing the alerts"
              disabled={pending}
            />
          </div>
          <div className="auth-field">
            <span>External enrollment provider (optional)</span>
            <input
              type="text"
              maxLength={64}
              value={externalProvider}
              onChange={(e) => setExternalProvider(e.target.value)}
              placeholder="authentik"
              disabled={pending}
            />
          </div>
          <div className="auth-field">
            <span>External enrollment token (optional)</span>
            <input
              type="password"
              maxLength={2048}
              value={externalToken}
              onChange={(e) => setExternalToken(e.target.value)}
              placeholder="Paste provider token"
              disabled={pending}
              autoComplete="off"
            />
          </div>
          <div className="auth-field">
            <span>Enrollment URL override (optional)</span>
            <input
              type="url"
              value={externalEnrollmentUrl}
              onChange={(e) => setExternalEnrollmentUrl(e.target.value)}
              placeholder="https://idp.example.com/if/flow/enrollment/"
              disabled={pending}
            />
          </div>
          <div className="auth-field">
            <span>External token expires (optional)</span>
            <input
              type="datetime-local"
              value={externalExpiresAt}
              onChange={(e) => setExternalExpiresAt(e.target.value)}
              disabled={pending}
            />
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="button primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create invite code'}
          </button>
        </form>
      </div>

      <div className="panel">
        <h2>Active and historical codes</h2>
        {codes.length === 0 ? (
          <p className="muted">No invite codes yet.</p>
        ) : (
          <div className="stack">
            {codes.map((code) => {
              const status = statusLabel(code);
              return (
                <div
                  key={code.id}
                  className="event-row"
                  style={{ gridTemplateColumns: '1fr auto', alignItems: 'center' }}
                >
                  <div>
                    <div
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace' }}
                    >
                      {code.code}
                    </div>
                    <div className="muted small">
                      Role: {code.role} · Created {new Date(code.createdAt).toLocaleString()}
                      {code.note ? ` · ${code.note}` : ''}
                      {code.expiresAt
                        ? ` · Expires ${new Date(code.expiresAt).toLocaleString()}`
                        : ''}
                    </div>
                    {code.identityProviderInvite && (
                      <div className="muted small">
                        External enrollment: {code.identityProviderInvite.provider}
                        {code.identityProviderInvite.expiresAt
                          ? ` · Token expires ${new Date(
                              code.identityProviderInvite.expiresAt,
                            ).toLocaleString()}`
                          : ''}
                        {code.identityProviderInvite.usedAt
                          ? ` · Token used ${new Date(
                              code.identityProviderInvite.usedAt,
                            ).toLocaleString()}`
                          : ''}
                      </div>
                    )}
                    <div className="muted small">
                      Invite link: <code>{`/register?invite=${code.code}`}</code>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <span className={`pill pill-${status.tone}`}>{status.label}</span>
                    {!code.isRevoked && code.usedCount < code.maxUses && (
                      <button
                        type="button"
                        className="button secondary"
                        onClick={() => handleRevoke(code.id)}
                        disabled={pending}
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Recent redemptions</h2>
        {redemptions.length === 0 ? (
          <p className="muted">No invite codes have been redeemed yet.</p>
        ) : (
          <div className="stack">
            {redemptions.map((r) => {
              const code = codes.find((c) => c.id === r.inviteCodeId);
              return (
                <div key={r.id} className="event-row">
                  <strong>{r.user.displayName ?? r.user.email}</strong>
                  <span className="muted small">
                    {r.user.email} used <code>{code?.code ?? r.inviteCodeId}</code> ·{' '}
                    {new Date(r.redeemedAt).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
