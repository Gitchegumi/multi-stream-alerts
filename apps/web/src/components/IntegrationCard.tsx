/**
 * IntegrationCard component for displaying platform connection status.
 *
 * Shows either:
 * - Empty state: platform logo + "Connect" button
 * - Connected state: avatar, display name, status badges, disconnect button
 */

'use client';

import React, { useState } from 'react';
import { PlatformIcon } from './PlatformIcon';

export interface LinkedAccount {
  id: string;
  platform: 'twitch' | 'youtube';
  platformAccountId: string;
  platformAccountName: string | null;
  channelId: string | null;
  isActive: boolean;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
}

interface IntegrationCardProps {
  platform: 'twitch' | 'youtube';
  account?: LinkedAccount;
  onConnect: () => void;
  onDisconnect: (id: string) => Promise<void>;
  onSetPrimary?: (id: string) => Promise<void>;
  /**
   * Whether the platform's OAuth flow is configured on this instance.
   * When false and the account is not yet linked, the card shows a
   * disabled/explanatory state instead of a Connect button that would
   * otherwise dead-end on the sign-in page. Defaults to true so existing
   * callers that only render cards for enabled providers are unaffected.
   */
  oauthAvailable?: boolean;
}

const PLATFORM_LABELS: Record<string, string> = {
  twitch: 'Twitch',
  youtube: 'YouTube',
};

const PLATFORM_COLORS = {
  twitch: {
    border: 'border-purple-500',
    text: 'text-purple-500',
    hover: 'hover:bg-purple-50',
    bg: 'bg-purple-500',
  },
  youtube: {
    border: 'border-red-500',
    text: 'text-red-500',
    hover: 'hover:bg-red-50',
    bg: 'bg-red-500',
  },
};

export function IntegrationCard({
  platform,
  account,
  onConnect,
  onDisconnect,
  onSetPrimary,
  oauthAvailable = true,
}: IntegrationCardProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const colors = PLATFORM_COLORS[platform];

  const handleDisconnect = async () => {
    if (!account) return;
    setIsLoading(true);
    try {
      await onDisconnect(account.id);
    } finally {
      setIsLoading(false);
      setShowConfirm(false);
    }
  };

  const handleSetPrimary = async () => {
    if (!account || !onSetPrimary) return;
    setIsLoading(true);
    try {
      await onSetPrimary(account.id);
    } finally {
      setIsLoading(false);
    }
  };

  if (!account) {
    if (!oauthAvailable) {
      return (
        <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
          <PlatformIcon platform={platform} size={48} className="mx-auto mb-4 opacity-50" />
          <h3 className="mb-2 text-lg font-semibold text-gray-900">{PLATFORM_LABELS[platform]}</h3>
          <p className="mb-4 text-sm text-gray-500">
            {PLATFORM_LABELS[platform]} account linking is not available on this instance. An
            administrator must configure the {PLATFORM_LABELS[platform]} OAuth credentials to enable
            it.
          </p>
          <button
            type="button"
            disabled
            aria-disabled="true"
            className="inline-flex min-h-[44px] cursor-not-allowed items-center justify-center rounded-lg border-2 border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-400"
          >
            Connect {PLATFORM_LABELS[platform]}
          </button>
        </div>
      );
    }
    return (
      <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center transition-colors hover:border-gray-400">
        <PlatformIcon platform={platform} size={48} className="mx-auto mb-4" />
        <h3 className="mb-2 text-lg font-semibold text-gray-900">{PLATFORM_LABELS[platform]}</h3>
        <p className="mb-4 text-sm text-gray-500">
          Connect your {PLATFORM_LABELS[platform]} account to receive stream alerts.
        </p>
        <button
          onClick={onConnect}
          className={`inline-flex items-center justify-center rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-colors ${colors.border} ${colors.text} ${colors.hover} min-h-[44px]`}
        >
          Connect {PLATFORM_LABELS[platform]}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-full ${platform === 'twitch' ? 'bg-purple-100' : 'bg-red-100'}`}
          >
            <PlatformIcon platform={platform} size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900">
                {account.platformAccountName ?? `${PLATFORM_LABELS[platform]} account`}
              </span>
              {account.isPrimary && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  ⭐ Primary
                </span>
              )}
            </div>
            {!account.platformAccountName && (
              <p className="text-xs text-gray-500">Reconnect to refresh the account name</p>
            )}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500"></span>
              <span className="text-xs text-green-600">Active</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {platform === 'youtube' && !account.isPrimary && onSetPrimary && (
            <button
              onClick={handleSetPrimary}
              disabled={isLoading}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              Set Primary
            </button>
          )}
          <button
            onClick={() => setShowConfirm(true)}
            disabled={isLoading}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            {isLoading ? '...' : 'Disconnect'}
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p className="mb-3 text-sm text-gray-700">
            Disconnect {PLATFORM_LABELS[platform]} account{' '}
            <strong>{account.platformAccountName ?? `${PLATFORM_LABELS[platform]} account`}</strong>
            ? This will stop all alerts for this account.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              onClick={handleDisconnect}
              disabled={isLoading}
              className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              {isLoading ? 'Disconnecting...' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
