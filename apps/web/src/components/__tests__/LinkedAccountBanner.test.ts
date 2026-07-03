import test from 'node:test';
import assert from 'node:assert/strict';
import { getLinkStatus, type LinkStatus } from '../LinkedAccountBanner.tsx';
import type { LinkedAccount } from '../IntegrationCard.tsx';

function makeAccount(
  overrides: Partial<LinkedAccount> & { platform: 'twitch' | 'youtube' },
): LinkedAccount {
  return {
    id: 'acc-1',
    platformAccountId: 'platform-id',
    platformAccountName: 'Display Name',
    channelId: null,
    isActive: true,
    isPrimary: false,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

test('getLinkStatus returns both unlinked for empty accounts', () => {
  const expected: LinkStatus = { twitch: false, youtube: false };
  assert.deepEqual(getLinkStatus([]), expected);
});

test('getLinkStatus returns twitch true when only Twitch is linked', () => {
  const accounts = [makeAccount({ platform: 'twitch', platformAccountId: 'twitch-user' })];
  assert.deepEqual(getLinkStatus(accounts), { twitch: true, youtube: false });
});

test('getLinkStatus returns youtube true when only YouTube is linked', () => {
  const accounts = [makeAccount({ platform: 'youtube', platformAccountId: 'yt-channel' })];
  assert.deepEqual(getLinkStatus(accounts), { twitch: false, youtube: true });
});

test('getLinkStatus returns both true when both platforms are linked', () => {
  const accounts = [
    makeAccount({ platform: 'twitch', platformAccountId: 'twitch-user' }),
    makeAccount({ platform: 'youtube', platformAccountId: 'yt-channel' }),
  ];
  assert.deepEqual(getLinkStatus(accounts), { twitch: true, youtube: true });
});

test('getLinkStatus ignores inactive accounts', () => {
  const accounts = [
    makeAccount({ platform: 'twitch', isActive: false }),
    makeAccount({ platform: 'youtube', isActive: false }),
  ];
  assert.deepEqual(getLinkStatus(accounts), { twitch: false, youtube: false });
});

test('getLinkStatus ignores duplicate platforms but respects active state', () => {
  const accounts = [
    makeAccount({ platform: 'twitch', isActive: false }),
    makeAccount({ platform: 'twitch', platformAccountId: 'active-twitch', isActive: true }),
  ];
  assert.deepEqual(getLinkStatus(accounts), { twitch: true, youtube: false });
});
