/**
 * IntegrationsSection — consolidates all integration management into a
 * single section for the workspace Settings page.
 *
 * Renders three provider cards in one place:
 * - Ko-fi: manual verification-token form (no OAuth available)
 * - Twitch: OAuth connect/disconnect card (when provider env vars are
 *   configured) AND manual credential form side by side
 * - YouTube: OAuth connect/disconnect card (when provider env vars are
 *   configured) AND manual credential form side by side
 *
 * When OAuth provider env vars are missing, the OAuth card shows a
 * clear disabled state with an explanation instead of silently hiding.
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import {
  type CredentialStatus,
  type IntegrationProvider,
  PROVIDERS,
} from '@multi-stream-alerts/database';
import { IntegrationSettingsForm } from '@/components/IntegrationSettingsForm';
import { IntegrationCard, type LinkedAccount } from '@/components/IntegrationCard';

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

function labelForProvider(p: IntegrationProvider): string {
  if (p === 'kofi') return 'Ko-fi';
  if (p === 'twitch') return 'Twitch';
  return 'YouTube';
}

function descriptionForProvider(p: IntegrationProvider): string {
  if (p === 'kofi') return 'Webhook verification token from your Ko-fi account settings.';
  if (p === 'twitch') return 'EventSub secret, client ID, client secret, and broadcaster ID.';
  return 'Client ID and client secret for YouTube Data API access.';
}

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

  // Parse query params for OAuth callback feedback
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
      const res = await fetch('/api/linked-accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch linked accounts:', err);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnect = async (platform: 'twitch' | 'youtube') => {
    const provider = platform === 'youtube' ? 'google' : 'twitch';
    const callbackUrl = `/dashboard/${encodeURIComponent(channelSlug)}/settings?connected=${platform}#integrations`;
    try {
      const res = await fetch(`/api/auth/link?provider=${provider}`);
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

  const handleDisconnect = async (id: string) => {
    try {
      const res = await fetch('/api/linked-accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setToast({ message: 'Account disconnected', type: 'success' });
        await fetchAccounts();
      } else {
        setToast({ message: 'Failed to disconnect account', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to disconnect account', type: 'error' });
    }
  };

  const handleSetPrimary = async (id: string) => {
    try {
      const res = await fetch(`/api/linked-accounts/${id}/primary`, {
        method: 'PATCH',
      });
      if (res.ok) {
        setToast({ message: 'Primary channel updated', type: 'success' });
        await fetchAccounts();
      } else {
        setToast({ message: 'Failed to update primary channel', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Failed to update primary channel', type: 'error' });
    }
  };

  const twitchAccount = accounts.find((a) => a.platform === 'twitch' && a.isActive);
  const youtubeAccounts = accounts.filter((a) => a.platform === 'youtube' && a.isActive);

  // Find pre-fetched credential statuses
  const getStatus = (provider: IntegrationProvider) =>
    initialStatuses.find((s) => s.provider === provider)?.status ?? {
      configured: {},
      public: { twitchBroadcasterId: null },
      isEnabled: false,
    };

  return (
    <div id="integrations" className="integrations-section">
      <h3>Integrations</h3>
      <p className="muted">
        Connect Ko-fi, Twitch, and YouTube to receive alerts when events fire on those platforms.
      </p>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Ko-fi — manual credentials only */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h4>{labelForProvider('kofi')}</h4>
        <p className="muted">{descriptionForProvider('kofi')}</p>
        <IntegrationSettingsForm
          channelSlug={channelSlug}
          provider="kofi"
          initialStatus={getStatus('kofi')}
          readOnly={!canManage}
        />
      </div>

      {/* Twitch — OAuth + manual credentials */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h4>{labelForProvider('twitch')}</h4>
        <p className="muted">{descriptionForProvider('twitch')}</p>

        {twitchOAuthEnabled ? (
          <div style={{ marginBottom: 16 }}>
            <h5 className="muted" style={{ marginBottom: 8 }}>
              OAuth account link
            </h5>
            {isLoadingAccounts ? (
              <div className="h-24 animate-pulse rounded-xl bg-gray-100"></div>
            ) : (
              <IntegrationCard
                platform="twitch"
                account={twitchAccount}
                onConnect={() => handleConnect('twitch')}
                onDisconnect={handleDisconnect}
              />
            )}
          </div>
        ) : (
          <div
            className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center"
            style={{ marginBottom: 16 }}
          >
            <p className="text-sm text-gray-500">
              Twitch OAuth is not available on this instance. An administrator must set{' '}
              <code>TWITCH_CLIENT_ID</code> and <code>TWITCH_CLIENT_SECRET</code> environment
              variables to enable account linking.
            </p>
          </div>
        )}

        <h5 className="muted" style={{ marginBottom: 8 }}>
          Manual credentials
        </h5>
        <IntegrationSettingsForm
          channelSlug={channelSlug}
          provider="twitch"
          initialStatus={getStatus('twitch')}
          readOnly={!canManage}
        />
      </div>

      {/* YouTube — OAuth + manual credentials */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h4>{labelForProvider('youtube')}</h4>
        <p className="muted">{descriptionForProvider('youtube')}</p>

        {googleOAuthEnabled ? (
          <div style={{ marginBottom: 16 }}>
            <h5 className="muted" style={{ marginBottom: 8 }}>
              OAuth account link
            </h5>
            {isLoadingAccounts ? (
              <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-xl bg-gray-100"></div>
                <div className="h-24 animate-pulse rounded-xl bg-gray-100"></div>
              </div>
            ) : (
              <div className="space-y-4">
                {youtubeAccounts.length === 0 ? (
                  <IntegrationCard
                    platform="youtube"
                    onConnect={() => handleConnect('youtube')}
                    onDisconnect={handleDisconnect}
                  />
                ) : (
                  <>
                    {youtubeAccounts.map((account) => (
                      <IntegrationCard
                        key={account.id}
                        platform="youtube"
                        account={account}
                        onConnect={() => handleConnect('youtube')}
                        onDisconnect={handleDisconnect}
                        onSetPrimary={handleSetPrimary}
                      />
                    ))}
                    {youtubeAccounts.length < 5 && (
                      <button
                        onClick={() => handleConnect('youtube')}
                        className="w-full rounded-lg border-2 border-dashed border-gray-300 py-3 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700"
                      >
                        + Add Another YouTube Channel
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className="rounded-xl border-2 border-dashed border-gray-300 p-4 text-center"
            style={{ marginBottom: 16 }}
          >
            <p className="text-sm text-gray-500">
              YouTube OAuth is not available on this instance. An administrator must set{' '}
              <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code> environment
              variables to enable account linking.
            </p>
          </div>
        )}

        <h5 className="muted" style={{ marginBottom: 8 }}>
          Manual credentials
        </h5>
        <IntegrationSettingsForm
          channelSlug={channelSlug}
          provider="youtube"
          initialStatus={getStatus('youtube')}
          readOnly={!canManage}
        />
      </div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
