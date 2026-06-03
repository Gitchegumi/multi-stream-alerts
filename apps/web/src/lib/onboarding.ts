import type { UserRole } from '@multi-stream-alerts/database';

export const ONBOARDING_USER_ROLES = ['owner', 'editor', 'viewer'] as const;

export type OnboardingConfig = {
  enabled: boolean;
  requireInvite: boolean;
  defaultWorkspaceRole: UserRole;
};

export function readOnboardingConfig(env: NodeJS.ProcessEnv = process.env): OnboardingConfig {
  return {
    enabled: readBoolean(env.ONBOARDING_ENABLED, true),
    requireInvite: readBoolean(env.ONBOARDING_REQUIRE_INVITE, true),
    defaultWorkspaceRole: readUserRole(env.ONBOARDING_DEFAULT_WORKSPACE_ROLE, 'owner'),
  };
}

export function canUseRegisterPage({
  credentialsEnabled,
  oidcEnabled,
  onboardingEnabled,
}: {
  credentialsEnabled: boolean;
  oidcEnabled: boolean;
  onboardingEnabled: boolean;
}) {
  return credentialsEnabled || (oidcEnabled && onboardingEnabled);
}

function readBoolean(value: string | undefined, defaultValue: boolean) {
  if (value === undefined || value === '') {
    return defaultValue;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return defaultValue;
}

function readUserRole(value: string | undefined, defaultValue: UserRole): UserRole {
  if (ONBOARDING_USER_ROLES.includes(value as (typeof ONBOARDING_USER_ROLES)[number])) {
    return value as UserRole;
  }
  return defaultValue;
}
