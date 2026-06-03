import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseRegisterPage, readOnboardingConfig } from '../onboarding.ts';

test('/register remains available for OIDC onboarding when credentials are disabled', () => {
  assert.equal(
    canUseRegisterPage({
      credentialsEnabled: false,
      oidcEnabled: true,
      onboardingEnabled: true,
    }),
    true,
  );
});

test('/register is unavailable when every registration path is disabled', () => {
  assert.equal(
    canUseRegisterPage({
      credentialsEnabled: false,
      oidcEnabled: true,
      onboardingEnabled: false,
    }),
    false,
  );
});

test('onboarding flags default to invite-gated owner onboarding', () => {
  assert.deepEqual(readOnboardingConfig({}), {
    enabled: true,
    requireInvite: true,
    defaultWorkspaceRole: 'owner',
  });
});

test('onboarding invite requirement can be disabled', () => {
  assert.deepEqual(
    readOnboardingConfig({
      ONBOARDING_ENABLED: 'true',
      ONBOARDING_REQUIRE_INVITE: 'false',
      ONBOARDING_DEFAULT_WORKSPACE_ROLE: 'viewer',
    }),
    {
      enabled: true,
      requireInvite: false,
      defaultWorkspaceRole: 'viewer',
    },
  );
});

test('invalid onboarding booleans fall back to safe defaults', () => {
  assert.deepEqual(
    readOnboardingConfig({
      ONBOARDING_ENABLED: 'yes',
      ONBOARDING_REQUIRE_INVITE: 'no',
    }),
    {
      enabled: true,
      requireInvite: true,
      defaultWorkspaceRole: 'owner',
    },
  );
});
