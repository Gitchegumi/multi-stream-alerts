/**
 * IntegrationsSection — the workspace Settings → Integrations panel.
 *
 * Renders one compact card per provider in a responsive grid (issue #128):
 *
 * - Twitch / YouTube: OAuth-only. Connecting runs the account-link flow and
 *   the backend auto-provisions EventSub / WebSub — users never enter
 *   EventSub secrets, Client IDs/Secrets, or stream keys. When the instance
 *   has no provider OAuth credentials the card shows an admin-config note.
 * - Ko-fi: no OAuth link path, so it keeps a manual verification-token form,
 *   revealed by a "Configure" toggle inside its card.
 *
 * Each card shows the service name, a connection-status badge, the linked
 * account/channel identity where available, and a single primary action.
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { MAX_TWITCH_CHANNELS_PER_WORKSPACE } from '@/lib/linked-account-policy';
import { type CredentialStatus, type IntegrationProvider } from '@multi-stream-alerts/database';
import { IntegrationSettingsForm } from '@/components/IntegrationSettingsForm';
import { PlatformIcon } from '@/components/PlatformIcon';
import { type LinkedAccount } from '@/components/IntegrationCard';

type ProviderStatus = {
  provider: IntegrationProvider;
  status: CredentialStatus;
};

type Props = {
  channelSlug: string;
  /** Pre-fetched credential statuses for all three providers. */
  initialStatuses: ProviderStatus[];
  /** Whether the user can manage credentials (owner/admin). */
  canManage: boolean;
  /** Whether the Twitch OAuth provider is configured at the instance level. */
  twitchOAuthEnabled: boolean;
  /** Whether the YouTube/Google OAuth provider is configured at the instance level. */
  googleOAuthEnabled: boolean;
};

const MAX_YOUTUBE_CHANNELS = 5;

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

type BadgeTone = 'connected' | 'reconnect' | 'idle' | 'manual' | 'unavailable';

const BADGE_TONES: Record<BadgeTone, { text: string; dot: string; label: string }> = {
  connected: { text: 'text-emerald-400', dot: 'bg-emerald-500', label: 'Connected' },
  reconnect: { text: 'text-amber-400', dot: 'bg-amber-500', label: 'Needs reconnect' },
  idle: { text: 'text-muted', dot: 'bg-[var(--line-strong)]', label: 'Not connected' },
  manual: { text: 'text-muted', dot: 'bg-[var(--attention)]', label: 'Manual setup' },
  unavailable: { text: 'text-muted', dot: 'bg-[var(--line-strong)]', label: 'Unavailable' },
};

function StatusBadge({ tone, label }: { tone: BadgeTone; label?: string }) {
  const t = BADGE_TONES[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${t.text}`}>
      <span className={`h-2 w-2 rounded-full ${t.dot}`} aria-hidden />
      {label ?? t.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

function ProviderCard({
  icon,
  name,
  badge,
  children,
}: {
  icon: React.ReactNode;
  name: string;
  badge: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel-soft p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {icon}
          <span className="font-semibold text-soft-white">{name}</span>
        </div>
        {badge}
      </div>
      {children}
    </div>
  );
}

/** Small Ko-fi glyph (PlatformIcon only knows twitch/youtube). */
function KofiGlyph() {
  return (
    <span
      className="flex h-6 w-6 items-center justify-center rounded-full text-sm"
      style={{ background: '#ff5e5b' }}
      aria-label="Ko-fi"
    >
      ☕
    </span>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function IntegrationsSection({
  channelSlug,
  initialStatuses,
  canManage,
  twitchOAuthEnabled,
  googleOAuthEnabled,
}: Props) {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showKofiConfig, setShowKofiConfig] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Parse query params for OAuth callback feedback.
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      setToast({
        message: `${capitalize(connected)} account connected successfully`,
        type: 'success',
      });
    } else if (error) {
      setToast({ message: 'Failed to connect account. Please try again.', type: 'error' });
    }
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const fetchAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const res = await fetch(
        `/api/linked-accounts?channelSlug=${encodeURIComponent(channelSlug)}`,
      );
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch linked accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, [channelSlug]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnect = async (platform: 'twitch' | 'youtube') => {
    const provider = platform === 'youtube' ? 'google' : 'twitch';
    const callbackUrl = `/dashboard/${encodeURIComponent(channelSlug)}/settings?connected=${platform}#integrations`;
    try {
      const res = await fetch(
        `/api/auth/link?provider=${provider}&channelSlug=${encodeURIComponent(channelSlug)}`,
      );
      if (!res.ok) {
        setToast({ message: 'Failed to start linking flow. Please try again.', type: 'error' });
        return;
      }
      await signIn(provider, { callbackUrl });
    } catch (err) {
      console.error('OAuth linking failed:', err);
      setToast({ message: 'Failed to start linking flow. Please try again.', type: 'error' });
    }
  };

  const handleDisconnect = async (account: LinkedAccount) => {
    const label = account.platformAccountName ?? `${capitalize(account.platform)} account`;
    if (!confirm(`Disconnect ${account.platform} account "${label}"? This stops its alerts.`)) {
      return;
    }
    setBusyId(account.id);
    try {
      const res = await fetch('/api/linked-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: account.id }),
      });
      if (res.ok) {
        setToast({ message: 'Account disconnected', type: 'success' });
        await fetchAccounts();
      } else {
        setToast({ message: 'Failed to disconnect account', type: 'error' });
      }
    } catch {
      setToast({ message: 'Failed to disconnect account', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const handleSetPrimary = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/linked-accounts/${id}/primary`, { method: 'PATCH' });
      if (res.ok) {
        setToast({ message: 'Primary channel updated', type: 'success' });
        await fetchAccounts();
      } else {
        setToast({ message: 'Failed to update primary channel', type: 'error' });
      }
    } catch {
      setToast({ message: 'Failed to update primary channel', type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const twitchAccounts = accounts.filter((a) => a.platform === 'twitch' && a.isActive);
  const youtubeAccounts = accounts.filter((a) => a.platform === 'youtube' && a.isActive);

  const getStatus = (provider: IntegrationProvider): CredentialStatus =>
    initialStatuses.find((s) => s.provider === provider)?.status ?? {
      configured: {},
      public: { twitchBroadcasterId: null, youtubeChannelId: null },
      isEnabled: false,
    };

  const twitchStatus = getStatus('twitch');
  const youtubeStatus = getStatus('youtube');
  const kofiStatus = getStatus('kofi');

  // A linked account that isn't backed by a provisioned secret means the
  // OAuth grant is stale (e.g. scopes were expanded) — surface "reconnect".
  const twitchTone: BadgeTone = !twitchOAuthEnabled
    ? 'unavailable'
    : twitchAccounts.length > 0
      ? twitchStatus.isEnabled
        ? 'connected'
        : 'reconnect'
      : 'idle';

  const youtubeTone: BadgeTone = !googleOAuthEnabled
    ? 'unavailable'
    : youtubeAccounts.length > 0
      ? youtubeStatus.isEnabled
        ? 'connected'
        : 'reconnect'
      : 'idle';

  return (
    <div id="integrations" className="integrations-section">
      <h3>Integrations</h3>
      <p className="muted">
        Connect Twitch and YouTube with one click — sign in, approve access, and alerts start
        flowing. Ko-fi uses a manual token because it has no account-linking flow.
      </p>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-red-500/15 text-red-300'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Twitch */}
        <ProviderCard
          icon={<PlatformIcon platform="twitch" size={24} />}
          name="Twitch"
          badge={<StatusBadge tone={twitchTone} />}
        >
          {!twitchOAuthEnabled ? (
            <AdminNote provider="Twitch" envVars={['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET']} />
          ) : isLoadingAccounts ? (
            <CardSkeleton />
          ) : twitchAccounts.length > 0 ? (
            <div className="flex flex-col gap-2">
              {twitchAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  busy={busyId === account.id}
                  onDisconnect={() => handleDisconnect(account)}
                  canManage={canManage}
                />
              ))}
              {canManage && twitchAccounts.length < MAX_TWITCH_CHANNELS_PER_WORKSPACE && (
                <button
                  type="button"
                  className="link-button self-start text-sm"
                  onClick={() => handleConnect('twitch')}
                >
                  + Add another channel
                </button>
              )}
            </div>
          ) : (
            <ConnectPrompt
              note="Auto-configures EventSub — no secrets to enter."
              label="Connect Twitch"
              disabled={!canManage}
              onConnect={() => handleConnect('twitch')}
            />
          )}
        </ProviderCard>

        {/* YouTube */}
        <ProviderCard
          icon={<PlatformIcon platform="youtube" size={24} />}
          name="YouTube"
          badge={<StatusBadge tone={youtubeTone} />}
        >
          {!googleOAuthEnabled ? (
            <AdminNote provider="YouTube" envVars={['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET']} />
          ) : isLoadingAccounts ? (
            <CardSkeleton />
          ) : youtubeAccounts.length === 0 ? (
            <ConnectPrompt
              note="Auto-subscribes to your channel — no secrets to enter."
              label="Connect YouTube"
              disabled={!canManage}
              onConnect={() => handleConnect('youtube')}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {youtubeAccounts.map((account) => (
                <AccountRow
                  key={account.id}
                  account={account}
                  busy={busyId === account.id}
                  onDisconnect={() => handleDisconnect(account)}
                  onSetPrimary={account.isPrimary ? undefined : () => handleSetPrimary(account.id)}
                  canManage={canManage}
                />
              ))}
              {canManage && youtubeAccounts.length < MAX_YOUTUBE_CHANNELS && (
                <button
                  type="button"
                  className="link-button self-start text-sm"
                  onClick={() => handleConnect('youtube')}
                >
                  + Add another channel
                </button>
              )}
            </div>
          )}
        </ProviderCard>

        {/* Ko-fi */}
        <ProviderCard
          icon={<KofiGlyph />}
          name="Ko-fi"
          badge={<StatusBadge tone={kofiStatus.isEnabled ? 'connected' : 'manual'} />}
        >
          <p className="text-sm text-muted">
            Paste the webhook verification token from your Ko-fi account settings.
          </p>
          {!showKofiConfig ? (
            <button
              type="button"
              className="button-secondary self-start"
              onClick={() => setShowKofiConfig(true)}
            >
              {kofiStatus.isEnabled ? 'Reconfigure' : 'Configure'}
            </button>
          ) : (
            <div className="rounded-lg border border-line p-3">
              <IntegrationSettingsForm
                channelSlug={channelSlug}
                provider="kofi"
                initialStatus={kofiStatus}
                readOnly={!canManage}
              />
            </div>
          )}
        </ProviderCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card body pieces
// ---------------------------------------------------------------------------

function ConnectPrompt({
  note,
  label,
  disabled,
  onConnect,
}: {
  note: string;
  label: string;
  disabled: boolean;
  onConnect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{note}</p>
      <button
        type="button"
        className="button self-start"
        onClick={onConnect}
        disabled={disabled}
        title={disabled ? 'You do not have permission to manage integrations' : undefined}
      >
        {label}
      </button>
    </div>
  );
}

function AccountRow({
  account,
  busy,
  onDisconnect,
  onSetPrimary,
  canManage,
}: {
  account: LinkedAccount;
  busy: boolean;
  onDisconnect: () => void;
  onSetPrimary?: () => void;
  canManage: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-soft-white">
            {account.platformAccountName ?? `${capitalize(account.platform)} account`}
          </span>
          {account.isPrimary && (
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
              Primary
            </span>
          )}
        </div>
        {!account.platformAccountName && (
          <p className="truncate text-xs text-muted">Reconnect to refresh the account name</p>
        )}
      </div>
      {canManage && (
        <div className="flex shrink-0 items-center gap-1.5">
          {onSetPrimary && (
            <button
              type="button"
              className="link-button text-xs"
              onClick={onSetPrimary}
              disabled={busy}
            >
              Set primary
            </button>
          )}
          <button
            type="button"
            className="button-secondary px-2.5 py-1 text-xs"
            onClick={onDisconnect}
            disabled={busy}
          >
            {busy ? '…' : 'Disconnect'}
          </button>
        </div>
      )}
    </div>
  );
}

function AdminNote({ provider, envVars }: { provider: string; envVars: [string, string] }) {
  return (
    <p className="text-sm text-muted">
      {provider} account linking isn&apos;t available on this instance. An administrator must set{' '}
      <code>{envVars[0]}</code> and <code>{envVars[1]}</code> to enable it.
    </p>
  );
}

function CardSkeleton() {
  return <div className="h-12 animate-pulse rounded-lg bg-[var(--surface-soft)]" />;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
