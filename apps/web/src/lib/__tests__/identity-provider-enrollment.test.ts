import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExternalEnrollmentRedirectUrl,
  isExternalEnrollmentExpired,
  readEnrollmentConfig,
} from '../identity-provider-enrollment.ts';

test('buildExternalEnrollmentRedirectUrl appends Authentik itoken', () => {
  const url = buildExternalEnrollmentRedirectUrl({
    identityProviderInvite: {
      provider: 'authentik',
      externalToken: 'token-123',
      enrollmentUrl: 'https://idp.example.com/if/flow/enrollment/',
      expiresAt: null,
    },
    config: {
      enabled: true,
      provider: 'authentik',
      enrollmentUrl: null,
    },
  });

  assert.equal(url.toString(), 'https://idp.example.com/if/flow/enrollment/?itoken=token-123');
});

test('buildExternalEnrollmentRedirectUrl preserves existing query parameters', () => {
  const url = buildExternalEnrollmentRedirectUrl({
    identityProviderInvite: {
      provider: 'authentik',
      externalToken: 'token-123',
      enrollmentUrl: 'https://idp.example.com/enroll?flow=default',
      expiresAt: null,
    },
    config: {
      enabled: true,
      provider: 'authentik',
      enrollmentUrl: null,
    },
  });

  assert.equal(url.searchParams.get('flow'), 'default');
  assert.equal(url.searchParams.get('itoken'), 'token-123');
});

test('readEnrollmentConfig defaults to disabled enrollment', () => {
  assert.deepEqual(readEnrollmentConfig({}), {
    enabled: false,
    provider: null,
    enrollmentUrl: null,
  });
});

test('isExternalEnrollmentExpired returns true for past expiration', () => {
  assert.equal(
    isExternalEnrollmentExpired(
      { expiresAt: new Date('2026-06-02T00:00:00.000Z') },
      Date.parse('2026-06-03T00:00:00.000Z'),
    ),
    true,
  );
});

test('isExternalEnrollmentExpired returns false for future expiration', () => {
  assert.equal(
    isExternalEnrollmentExpired(
      { expiresAt: new Date('2026-06-04T00:00:00.000Z') },
      Date.parse('2026-06-03T00:00:00.000Z'),
    ),
    false,
  );
});

test('isExternalEnrollmentExpired returns false when expiration is null', () => {
  assert.equal(isExternalEnrollmentExpired({ expiresAt: null }), false);
});
