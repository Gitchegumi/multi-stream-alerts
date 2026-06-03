import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExternalEnrollmentRedirectUrl,
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
