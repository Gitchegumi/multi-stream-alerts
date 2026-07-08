import test from 'node:test';
import assert from 'node:assert/strict';
import {
  providerForPlatform,
  isPlatformOAuthEnabled,
  resolveConnectAction,
  type OAuthAvailability,
} from '../linked-account-connect.ts';

const ALL_ENABLED: OAuthAvailability = { twitch: true, youtube: true };
const NONE_ENABLED: OAuthAvailability = { twitch: false, youtube: false };

test('providerForPlatform maps youtube to the google OAuth provider', () => {
  assert.equal(providerForPlatform('youtube'), 'google');
});

test('providerForPlatform maps twitch to the twitch OAuth provider', () => {
  assert.equal(providerForPlatform('twitch'), 'twitch');
});

test('isPlatformOAuthEnabled reads the matching availability flag', () => {
  assert.equal(isPlatformOAuthEnabled('twitch', { twitch: true, youtube: false }), true);
  assert.equal(isPlatformOAuthEnabled('youtube', { twitch: true, youtube: false }), false);
});

test('resolveConnectAction returns a connect action with the correct provider slug', () => {
  assert.deepEqual(resolveConnectAction('twitch', ALL_ENABLED), {
    kind: 'connect',
    platform: 'twitch',
    provider: 'twitch',
  });
  assert.deepEqual(resolveConnectAction('youtube', ALL_ENABLED), {
    kind: 'connect',
    platform: 'youtube',
    provider: 'google',
  });
});

test('resolveConnectAction returns unavailable when the provider is not configured', () => {
  // This is the regression from #115: without this guard the Connect button
  // fired signIn() for a provider that does not exist, bouncing the user to
  // the sign-in page and then to the dashboard (the "redirect to homepage").
  assert.deepEqual(resolveConnectAction('twitch', NONE_ENABLED), {
    kind: 'unavailable',
    platform: 'twitch',
  });
  assert.deepEqual(resolveConnectAction('youtube', NONE_ENABLED), {
    kind: 'unavailable',
    platform: 'youtube',
  });
});

test('resolveConnectAction gates each platform independently', () => {
  const twitchOnly: OAuthAvailability = { twitch: true, youtube: false };
  assert.equal(resolveConnectAction('twitch', twitchOnly).kind, 'connect');
  assert.equal(resolveConnectAction('youtube', twitchOnly).kind, 'unavailable');
});
