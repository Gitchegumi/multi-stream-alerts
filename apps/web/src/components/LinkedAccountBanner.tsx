/**
 * LinkedAccountBanner component for surfacing Twitch/YouTube OAuth status.
 *
 * Self-contained, drop-in banner that fetches linked accounts and renders
 * compact IntegrationCards for each platform. Handles connect, disconnect,
 * set-primary, loading state, and toast feedback.
 */

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { IntegrationCard, type LinkedAccount } from '@/components/IntegrationCard';

export interface LinkStatus {
  twitch: boolean;
  youtube: boolean;
}

interface LinkedAccountBannerProps {
  callbackUrl?: string;
  compact?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
};

export function getLinkStatus(accounts: LinkedAccount[]): LinkStatus {
  return {
    twitch: accounts.some((a) => a.platform === 'twitch' && a.isActive),
    youtube: accounts.some((a) => a.platform === 'youtube' && a.isActive),
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LinkedAccountBanner({ callbackUrl, compact = true }: LinkedAccountBannerProps) {
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const currentUrl = typeof window !== 'undefined' ? window.location.href : undefined;
  const effectiveCallbackUrl = callbackUrl ?? currentUrl ?? '/dashboard/settings/integrations';

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');
    if (connected) {
      setToast({
        message: `${capitalize(connected)} account connected successfully 🛶`,
        type: 'success',
      });
    } else if (error) {
      setToast({ message: 'Failed to connect account. Please try again.', type: 'error' });
    }
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

  const handleConnect = async (platform: 'twitch' | 'youtube') => {
    const provider = platform === 'youtube' ? 'google' : 'twitch';
    const callback = effectiveCallbackUrl.replace('PLATFORM', platform);
    try {
      const res = await fetch(`/api/auth/link?provider=${provider}`);
      if (!res.ok) {
        setToast({ message: 'Failed to start linking flow. Please try again.', type: 'error' });
        return;
      }
      await signIn(provider, { callbackUrl: callback });
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
  const status = getLinkStatus(accounts);
  const allLinked = status.twitch && status.youtube;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Linked accounts</h2>
          <p className="text-sm text-gray-500">
            Connect Twitch and YouTube to receive alerts for those platforms.
          </p>
        </div>
        {allLinked && !isLoading && (
          <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-medium text-green-700">
            All connected 🛶
          </span>
        )}
      </div>

      {toast && (
        <div
          className={`mb-4 rounded-lg px-4 py-3 text-sm font-medium ${
            toast.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {toast.message}
        </div>
      )}

      {isLoading ? (
        <div className={compact ? 'flex gap-4' : 'grid gap-4 md:grid-cols-2'}>
          <div className="h-24 flex-1 animate-pulse rounded-xl bg-gray-100"></div>
          <div className="h-24 flex-1 animate-pulse rounded-xl bg-gray-100"></div>
        </div>
      ) : (
        <div className={compact ? 'flex flex-wrap gap-4' : 'grid gap-4 md:grid-cols-2'}>
          <IntegrationCard
            platform="twitch"
            account={twitchAccount}
            onConnect={() => handleConnect('twitch')}
            onDisconnect={handleDisconnect}
          />

          {youtubeAccounts.length === 0 ? (
            <IntegrationCard
              platform="youtube"
              onConnect={() => handleConnect('youtube')}
              onDisconnect={handleDisconnect}
            />
          ) : (
            <div className={compact ? 'contents' : 'space-y-4'}>
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
                  + Add Another {PLATFORM_LABELS.youtube} Channel
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
