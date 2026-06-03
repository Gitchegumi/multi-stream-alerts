export type EnrollmentConfig = {
  enabled: boolean;
  provider: string | null;
  enrollmentUrl: string | null;
};

export type IdentityProviderInviteForRedirect = {
  provider: string;
  externalToken: string;
  enrollmentUrl: string | null;
  expiresAt: Date | null;
};

export function readEnrollmentConfig(env: NodeJS.ProcessEnv = process.env): EnrollmentConfig {
  return {
    enabled: env.OIDC_ENROLLMENT_ENABLED === 'true',
    provider: env.OIDC_ENROLLMENT_PROVIDER?.trim().toLowerCase() || null,
    enrollmentUrl: env.OIDC_ENROLLMENT_URL?.trim() || null,
  };
}

export function buildExternalEnrollmentRedirectUrl({
  identityProviderInvite,
  config,
}: {
  identityProviderInvite: IdentityProviderInviteForRedirect;
  config: EnrollmentConfig;
}): URL {
  const provider = identityProviderInvite.provider.trim().toLowerCase();
  if (config.provider && provider !== config.provider) {
    throw new Error('Invite enrollment provider does not match configured provider');
  }

  const baseEnrollmentUrl = identityProviderInvite.enrollmentUrl ?? config.enrollmentUrl;
  if (!baseEnrollmentUrl) {
    throw new Error('Missing external enrollment URL');
  }

  const url = new URL(baseEnrollmentUrl);
  switch (provider) {
    case 'authentik':
      url.searchParams.set('itoken', identityProviderInvite.externalToken);
      break;
    default:
      throw new Error(`Unsupported external enrollment provider: ${provider}`);
  }
  return url;
}

export function isExternalEnrollmentExpired(
  identityProviderInvite: Pick<IdentityProviderInviteForRedirect, 'expiresAt'>,
  now = Date.now(),
) {
  return Boolean(
    identityProviderInvite.expiresAt && identityProviderInvite.expiresAt.getTime() <= now,
  );
}
