/**
 * Settings → Integrations page for managing linked OAuth accounts.
 *
 * Displays Twitch and YouTube connection cards, handles connect/disconnect
 * flows, and shows toast notifications for user feedback.
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { IntegrationCard, type LinkedAccount } from '@/components/IntegrationCard';

export default function IntegrationsPage() {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Parse query params for OAuth callback feedback
  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      setToast({ message: `${capitalize(connected)} account connected successfully ✅`, type: 'success' });
    } else if (error) {
      setToast({ message: 'Failed to connect account. Please try again.', type: 'error' });
    }
    // Clear toast after 4s
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const fetchAccounts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/linked-accounts');
      if (res.ok) {
        const data = await res.json();
        setAccounts(data.accounts ?? []);
      }
    } catch (err) {
      console.error('Failed to fetch linked accounts:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleConnect = (platform: 'twitch' | 'youtube') => {
    const provider = platform === 'youtube' ? 'google' : 'twitch';
    window.location.href = `/api/auth/signin/${provider}?callbackUrl=/dashboard/settings/integrations?connected=${platform}`;
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">Integrations</h1>
      <p className="mb-8 text-gray-600">
        Connect your streaming platform accounts to receive alerts when you go live.
      </p>

      {toast && (
        <div
          className={`mb-6 rounded-lg px-4 py-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-4">
          <div className="h-32 animate-pulse rounded-xl bg-gray-100"></div>
          <div className="h-32 animate-pulse rounded-xl bg-gray-100"></div>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          <IntegrationCard
            platform="twitch"
            account={twitchAccount}
            onConnect={() => handleConnect('twitch')}
            onDisconnect={handleDisconnect}
          />

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
        </div>
      )}
    </div>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
