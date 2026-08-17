import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformAccountName } from '../platform-account-name.ts';

test('uses the Twitch display name instead of the numeric provider id', () => {
  assert.equal(
    getPlatformAccountName(
      'twitch',
      { sub: '60717512', preferred_username: 'GitcheGumi', name: '60717512' },
      '60717512',
    ),
    'GitcheGumi',
  );
});

test('supports Twitch payloads that expose display_name or login', () => {
  assert.equal(
    getPlatformAccountName('twitch', { display_name: 'Creator Name' }, '123'),
    'Creator Name',
  );
  assert.equal(
    getPlatformAccountName('twitch', { login: 'creator_login' }, '123'),
    'creator_login',
  );
});

test('never treats the provider id as a friendly account name', () => {
  assert.equal(getPlatformAccountName('twitch', { name: '60717512' }, '60717512'), null);
});

test('uses the Google profile name as a fallback for YouTube', () => {
  assert.equal(getPlatformAccountName('google', { name: 'Creator' }, 'google-sub'), 'Creator');
});
