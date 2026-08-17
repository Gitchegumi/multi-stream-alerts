import type { NextAuthOptions, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import TwitchProvider from 'next-auth/providers/twitch';
import GoogleProvider from 'next-auth/providers/google';
import { cookies } from 'next/headers';
import {
  canManageChannelCredentials,
  prisma,
  redeemInviteCodeInTransaction,
  assertInviteIsUsable,
  InviteCodeError,
  verifyPassword,
  provisionTwitchEventSub,
  resolveYoutubeChannel,
  resolveYoutubeChannelId,
  provisionYoutubeWebSub,
  type Prisma,
} from '@multi-stream-alerts/database';
import { INVITE_CODE_COOKIE, validateInviteCodeForCookie } from './oidc-state';
import { createChannelWithUniqueSlug } from './channel-slug';
import { readOnboardingConfig } from './onboarding';
import { encrypt } from '@multi-stream-alerts/shared';
import { consumeLinkingState, peekLinkingState } from '@/lib/linking-state';
import { getPlatformAccountName } from '@/lib/platform-account-name';
import { MAX_TWITCH_CHANNELS_PER_WORKSPACE } from '@/lib/linked-account-policy';

type OidcProfile = Profile & {
  sub?: string;
  email?: string;
  /**
   * Some IdPs (Google, Authentik) populate `email_verified`. We do NOT
   * gate sign-in on this claim: the trust anchor for new accounts is the
   * invite code (a one-time, admin-issued secret), not the email's
   * verification status. An attacker who controls the IdP's
   * `email_verified` claim also controls `sub`/`email`, so the check
   * adds no real security. Logging it for visibility is enough.
   */
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
};

const oidcIssuer = (
  process.env.AUTH_OIDC_ISSUER ?? 'https://<your-oidc-provider>/<issuer-path>'
).replace(/\/+$/, '');

const oidcEnabled = process.env.AUTH_OIDC_ENABLED !== 'false';
const credentialsEnabled = process.env.AUTH_CREDENTIALS_ENABLED === 'true';

type OidcAccount = {
  provider: string;
  providerAccountId?: string;
};

export type OidcSignInDeps = {
  prisma: {
    user: {
      findFirst: typeof prisma.user.findFirst;
      create: typeof prisma.user.create;
      update: typeof prisma.user.update;
    };
    $transaction: typeof prisma.$transaction;
  };
  getInviteCookie: () => Promise<string | undefined> | string | undefined;
  deleteInviteCookie: () => Promise<void> | void;
  createChannelWithUniqueSlug: typeof createChannelWithUniqueSlug;
  redeemInviteCodeInTransaction: typeof redeemInviteCodeInTransaction;
  assertInviteIsUsable: typeof assertInviteIsUsable;
  markIdentityProviderInviteUsed?: (
    tx: Prisma.TransactionClient,
    inviteCodeId: string,
  ) => Promise<void>;
  env: NodeJS.ProcessEnv;
};

const oidcSignInDeps: OidcSignInDeps = {
  prisma,
  async getInviteCookie() {
    const cookieJar = await cookies();
    return cookieJar.get(INVITE_CODE_COOKIE)?.value;
  },
  async deleteInviteCookie() {
    try {
      const cookieJar = await cookies();
      cookieJar.delete(INVITE_CODE_COOKIE);
    } catch {
      /* cookie may be in a different request scope; safe to ignore */
    }
  },
  createChannelWithUniqueSlug,
  redeemInviteCodeInTransaction,
  assertInviteIsUsable,
  async markIdentityProviderInviteUsed(tx, inviteCodeId) {
    await tx.identityProviderInvite.updateMany({
      where: { inviteCodeId, usedAt: null },
      data: { usedAt: new Date() },
    });
  },
  env: process.env,
};

function buildOidcProvider() {
  const baseUrl = (
    process.env.NEXTAUTH_URL ??
    process.env.PUBLIC_BASE_URL ??
    'https://<your-alerts-domain>'
  ).replace(/\/$/, '');

  if (!process.env.NEXTAUTH_URL && !process.env.PUBLIC_BASE_URL) {
    console.warn(
      '[auth] Neither NEXTAUTH_URL nor PUBLIC_BASE_URL is set. ' +
        'OIDC callback URIs will use the hard-coded placeholder. ' +
        'Set one of these env vars so the reverse proxy routes correctly.',
    );
  }

  return {
    id: 'oidc' as const,
    name: process.env.AUTH_OIDC_PROVIDER_NAME ?? 'OIDC',
    type: 'oauth' as const,
    issuer: oidcIssuer,
    wellKnown: `${oidcIssuer}/.well-known/openid-configuration`,
    clientId: process.env.AUTH_OIDC_CLIENT_ID ?? '<your-oidc-client-id>',
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? '<your-oidc-client-secret>',
    authorization: { params: { scope: 'openid email profile' } },
    // NextAuth v4 uses a relative callback redirect by default, but behind
    // reverse proxies it can resolve to the internal hostname. Explicitly
    // set the callback URL so Authentik receives the public canonical URL.
    client: {
      redirect_uris: [`${baseUrl}/api/auth/callback/oidc`],
    },
    checks: ['pkce', 'state', 'nonce'] as ('pkce' | 'state' | 'nonce')[],
    profile(profile: Record<string, unknown>) {
      return {
        id: (profile.sub as string) ?? (profile.email as string) ?? '',
        email: profile.email as string | undefined,
        name:
          (profile.name as string) ??
          (profile.preferred_username as string) ??
          (profile.email as string),
      };
    },
  };
}

function buildCredentialsProvider() {
  return CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null;
      }
      const user = await prisma.user.findUnique({
        where: { email: credentials.email },
        include: { localCredential: true },
      });
      if (!user || !user.localCredential) {
        return null;
      }
      const valid = await verifyPassword(credentials.password, user.localCredential.passwordHash);
      if (!valid) {
        return null;
      }
      return {
        id: user.id,
        email: user.email,
        name: user.displayName ?? user.email,
        role: user.role,
      };
    },
  });
}

const providers: NextAuthOptions['providers'] = [];
if (oidcEnabled) {
  providers.push(buildOidcProvider());
}
if (credentialsEnabled) {
  providers.push(buildCredentialsProvider());
}

const twitchEnabled = !!process.env.TWITCH_CLIENT_ID && !!process.env.TWITCH_CLIENT_SECRET;
const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

if (twitchEnabled) {
  providers.push(
    TwitchProvider({
      clientId: process.env.TWITCH_CLIENT_ID!,
      clientSecret: process.env.TWITCH_CLIENT_SECRET!,
      authorization: {
        params: {
          // Scopes cover the EventSub subscription types the backend
          // auto-provisions on connect (see SUPPORTED_TWITCH_SUBSCRIPTIONS).
          // Expanding these invalidates older links, which then surface as
          // "Needs reconnect" in the integrations UI.
          scope: [
            'openid',
            'user:read:email',
            'moderator:read:followers',
            'channel:read:subscriptions',
            'bits:read',
            'channel:read:charity',
            'channel:read:redemptions',
          ].join(' '),
        },
      },
    }),
  );
}

if (googleEnabled) {
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube.readonly',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  );
}

export type WorkspaceLinkTransaction = Pick<Prisma.TransactionClient, 'linkedAccount'>;

export type WithWorkspaceLinkLock = <T>(
  channelId: string,
  operation: (tx: WorkspaceLinkTransaction) => Promise<T>,
) => Promise<T>;

/**
 * Serialize linked-account lifecycle changes per workspace. PostgreSQL releases the
 * advisory lock automatically when the transaction commits or rolls back.
 */
export async function withWorkspaceLinkLock<T>(
  channelId: string,
  operation: (tx: WorkspaceLinkTransaction) => Promise<T>,
  database: typeof prisma = prisma,
): Promise<T> {
  return database.$transaction(
    async (tx) => {
      // PostgreSQL declares pg_advisory_xact_lock as returning `void`, which
      // Prisma cannot deserialize from $queryRaw. Cast the otherwise-unused
      // result while keeping the parameterized workspace key and lock scope.
      await tx.$queryRaw<Array<{ lock_acquired: string }>>`
        SELECT pg_advisory_xact_lock(hashtextextended(${channelId}, 0))::text AS lock_acquired
      `;
      return operation(tx);
    },
    // Twitch creates several EventSub subscriptions serially. The default
    // interactive-transaction timeout is too short for provider round trips.
    { maxWait: 10_000, timeout: 60_000 },
  );
}

export type LinkedOAuthSignInDeps = {
  prisma: typeof prisma;
  canManageChannelCredentials: typeof canManageChannelCredentials;
  resolveYoutubeChannel: typeof resolveYoutubeChannel;
  provisionLinkedAccount: typeof provisionLinkedAccount;
  withWorkspaceLinkLock: WithWorkspaceLinkLock;
  encrypt: typeof encrypt;
};

/**
 * Commit a Twitch/YouTube OAuth grant only after rechecking current workspace
 * authority and the server-side Twitch channel cap. The signed linking state
 * identifies intent, but it is not an authorization snapshot: roles may have
 * changed while the user was at the provider consent screen.
 */
export async function handleLinkedOAuthSignIn(
  {
    account,
    profile,
    linkingState,
  }: {
    account: {
      provider: string;
      providerAccountId: string;
      access_token?: string | null;
      refresh_token?: string | null;
      expires_at?: number | null;
    };
    profile: Profile | undefined;
    linkingState: { userId: string; channelId: string | null };
  },
  deps?: LinkedOAuthSignInDeps,
): Promise<boolean> {
  const d: LinkedOAuthSignInDeps = deps ?? {
    prisma,
    canManageChannelCredentials,
    resolveYoutubeChannel,
    provisionLinkedAccount,
    withWorkspaceLinkLock,
    encrypt,
  };
  if (account.provider !== 'twitch' && account.provider !== 'google') {
    return false;
  }
  const { userId, channelId } = linkingState;
  if (!channelId) {
    console.warn('OAuth sign-in: linking state has no workspace', { provider: account.provider });
    return false;
  }

  const dbUser = await d.prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) {
    console.warn('OAuth sign-in: linking user no longer exists', { provider: account.provider });
    return false;
  }
  if (!(await d.canManageChannelCredentials(dbUser.id, dbUser.role, channelId))) {
    console.warn('OAuth sign-in: linking user no longer manages workspace credentials', {
      provider: account.provider,
      channelId,
    });
    return false;
  }

  const platform = account.provider === 'google' ? 'youtube' : 'twitch';
  let platformAccountName = getPlatformAccountName(
    account.provider,
    profile as Record<string, unknown> | undefined,
    account.providerAccountId,
  );
  const youtubeChannel =
    account.provider === 'google' && account.access_token
      ? await d.resolveYoutubeChannel(account.access_token)
      : null;
  platformAccountName = youtubeChannel?.title ?? platformAccountName;

  const committed = await d.withWorkspaceLinkLock(channelId, async (tx) => {
    const existing = await tx.linkedAccount.findUnique({
      where: {
        userId_platform_platformAccountId: {
          userId: dbUser.id,
          platform,
          platformAccountId: account.providerAccountId,
        },
      },
      select: { channelId: true, isActive: true },
    });

    if (platform === 'twitch') {
      const activeCount = await tx.linkedAccount.count({
        where: { channelId, platform: 'twitch', isActive: true },
      });
      const reconnectingActiveAccount = existing?.isActive && existing.channelId === channelId;
      if (activeCount >= MAX_TWITCH_CHANNELS_PER_WORKSPACE && !reconnectingActiveAccount) {
        return false;
      }
    }

    const existingCount = await tx.linkedAccount.count({
      where: { userId: dbUser.id, platform },
    });
    await tx.linkedAccount.upsert({
      where: {
        userId_platform_platformAccountId: {
          userId: dbUser.id,
          platform,
          platformAccountId: account.providerAccountId,
        },
      },
      create: {
        userId: dbUser.id,
        channelId,
        platform,
        platformAccountId: account.providerAccountId,
        platformAccountName,
        encryptedAccessToken: d.encrypt(account.access_token ?? ''),
        encryptedRefreshToken: account.refresh_token ? d.encrypt(account.refresh_token) : null,
        tokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
        isActive: true,
        isPrimary: existingCount === 0,
      },
      update: {
        channelId,
        platformAccountName: platformAccountName ?? undefined,
        encryptedAccessToken: d.encrypt(account.access_token ?? ''),
        encryptedRefreshToken: account.refresh_token ? d.encrypt(account.refresh_token) : null,
        tokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
        isActive: true,
      },
    });

    // Twitch's shared EventSub secret is selected and persisted during
    // provisioning. Keep that work inside the same workspace lock as account
    // activation so concurrent first links cannot create subscriptions with
    // different secrets. YouTube provisioning is serialized consistently.
    await d.provisionLinkedAccount({
      platform,
      providerAccountId: account.providerAccountId,
      accessToken: account.access_token,
      channelId,
      youtubeChannelId: youtubeChannel?.id,
    });
    return true;
  });

  if (!committed) {
    console.warn('OAuth sign-in: workspace Twitch channel limit reached', { channelId });
    return false;
  }

  return true;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
  },
  providers,
  callbacks: {
    async signIn({ account, profile }) {
      const oidcProfile = profile as OidcProfile | undefined;

      if (oidcProfile?.email_verified === false) {
        console.warn('OIDC sign-in arrived with email_verified=false', {
          email: oidcProfile.email,
        });
      }

      // Credentials sign-in: the authorize callback already validated the
      // password, so short-circuit.
      if (account?.provider === 'credentials') {
        return true;
      }

      // OAuth account linking for Twitch / YouTube
      if (account?.provider === 'twitch' || account?.provider === 'google') {
        // Peek at the signed cookie set by /api/auth/link which stores the
        // currently authenticated user's ID (and optionally the channelId
        // of the workspace the link should be scoped to). This binds the
        // linked account to the user who clicked Connect, not to the OAuth
        // email. Do NOT consume (delete) the cookie here — the jwt callback
        // needs to read it again to hydrate the session as the original
        // app user.
        const linkingState = await peekLinkingState();
        if (!linkingState) {
          console.warn('OAuth sign-in: missing or invalid linking cookie', {
            provider: account.provider,
          });
          return false;
        }

        return handleLinkedOAuthSignIn({ account, profile, linkingState });
      }

      return handleOidcSignIn({ account, profile: oidcProfile }, oidcSignInDeps);
    },
    async jwt({ token, account, profile }) {
      // Existing sessions already carry our custom claims — short-circuit.
      if (token.userId && token.role) {
        return token;
      }

      // OAuth linking: the signIn callback peeked at the linking cookie
      // without deleting it. Consume it here (read + delete) when the
      // session token is actually being hydrated, so we can restore the
      // original app user after the OAuth round trip.
      const linkingState = await consumeLinkingState();
      if (linkingState) {
        const dbUser = await prisma.user.findUnique({
          where: { id: linkingState.userId },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.email = dbUser.email;
          token.name = dbUser.displayName ?? dbUser.email;
          return token;
        }
      }

      if (token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
        });
        if (dbUser) {
          token.userId = dbUser.id;
          token.role = dbUser.role;
          token.email = dbUser.email;
          token.name = dbUser.displayName ?? dbUser.email;
          return token;
        }
      }

      const oidcProfile = profile as OidcProfile | undefined;
      const authSubject = oidcProfile?.sub ?? account?.providerAccountId;

      const dbUser = authSubject
        ? await prisma.user.findUnique({
            where: {
              authProvider_authSubject: {
                authProvider: account?.provider ?? 'oidc',
                authSubject,
              },
            },
          })
        : null;

      if (dbUser) {
        token.userId = dbUser.id;
        token.role = dbUser.role;
        token.email = dbUser.email;
        token.name = dbUser.displayName ?? dbUser.email;
      }

      return token;
    },
    async session({ session, token }) {
      if (!token.userId || !token.role) {
        throw new Error('Missing authenticated user');
      }

      session.user.id = token.userId;
      session.user.role = token.role;
      return session;
    },
  },
};

export { oidcEnabled, credentialsEnabled, twitchEnabled, googleEnabled };

/**
 * Auto-provision the provider integration for a freshly-linked account so the
 * user only has to click "Connect" and approve — no manual EventSub/WebSub
 * setup (issue #128). Requires a workspace (`channelId`) to scope the
 * integration to; user-level links (no channelId) are skipped. All failures
 * are swallowed with a log so they can never break the OAuth sign-in flow.
 */
export async function provisionLinkedAccount(input: {
  platform: 'twitch' | 'youtube';
  providerAccountId: string;
  accessToken?: string | null;
  channelId: string | null;
  youtubeChannelId?: string;
}): Promise<void> {
  if (!input.channelId) {
    console.warn('[auth] linked account has no workspace; skipping auto-provisioning', {
      platform: input.platform,
    });
    return;
  }

  try {
    if (input.platform === 'twitch') {
      await provisionTwitchEventSub({
        channelId: input.channelId,
        broadcasterUserId: input.providerAccountId,
      });
      return;
    }

    // YouTube: resolve the channel id from the granted token, then subscribe.
    if (!input.accessToken) {
      console.warn('[auth] youtube link missing access token; skipping auto-provisioning');
      return;
    }
    const youtubeChannelId =
      input.youtubeChannelId ?? (await resolveYoutubeChannelId(input.accessToken));
    if (!youtubeChannelId) {
      console.warn('[auth] could not resolve YouTube channel id; skipping auto-provisioning');
      return;
    }
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId },
      select: { slug: true },
    });
    if (!channel) return;
    await provisionYoutubeWebSub({
      channelId: input.channelId,
      channelSlug: channel.slug,
      youtubeChannelId,
    });
  } catch (err) {
    console.error('[auth] auto-provisioning failed', {
      platform: input.platform,
      channelId: input.channelId,
      reason: err instanceof Error ? err.message : 'unknown_error',
    });
  }
}

export async function handleOidcSignIn(
  {
    account,
    profile,
  }: {
    account: OidcAccount | null | undefined;
    profile: OidcProfile | undefined;
  },
  deps: OidcSignInDeps = oidcSignInDeps,
) {
  const authSubject = profile?.sub ?? account?.providerAccountId;
  const email = profile?.email;

  if (!account || !authSubject || !email) {
    return false;
  }

  const existingUser = await deps.prisma.user.findFirst({
    where: {
      OR: [{ authProvider: account.provider, authSubject }, { email }],
    },
  });

  if (existingUser) {
    await deps.prisma.user.update({
      where: { id: existingUser.id },
      data: {
        authProvider: account.provider,
        authSubject,
        displayName: profile?.name ?? existingUser.displayName,
      },
    });
    return true;
  }

  const isInitialAdmin = email === deps.env.INITIAL_ADMIN_EMAIL;
  if (isInitialAdmin) {
    await deps.prisma.user.create({
      data: {
        authProvider: account.provider,
        authSubject,
        email,
        displayName: profile?.name ?? email,
        role: 'admin',
      },
    });
    return true;
  }

  const onboarding = readOnboardingConfig(deps.env);
  if (!onboarding.enabled) {
    return false;
  }

  const rawInvite = await deps.getInviteCookie();
  const inviteValidation = validateInviteCodeForCookie(rawInvite);

  if (onboarding.requireInvite && !inviteValidation.ok) {
    return false;
  }

  if (inviteValidation.ok) {
    await deps.deleteInviteCookie();
  }

  try {
    await deps.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          authProvider: account.provider,
          authSubject,
          email,
          displayName: profile?.name ?? email,
          role: onboarding.defaultWorkspaceRole,
        },
      });

      if (inviteValidation.ok) {
        const invite = await tx.inviteCode.findUnique({
          where: { code: inviteValidation.inviteCode },
        });
        if (!invite) {
          throw new InviteCodeError('INVALID', 'Invite code not found');
        }
        deps.assertInviteIsUsable(invite);

        const redeemed = await deps.redeemInviteCodeInTransaction(tx, {
          invite,
          userId: user.id,
        });

        if (redeemed.role !== onboarding.defaultWorkspaceRole) {
          await tx.user.update({
            where: { id: user.id },
            data: { role: redeemed.role },
          });
        }

        await deps.markIdentityProviderInviteUsed?.(tx, invite.id);
      }

      const channel = await deps.createChannelWithUniqueSlug(
        tx,
        profile?.name ?? email.split('@')[0] ?? 'My Channel',
        email,
        user.id,
      );

      await tx.channelMembership.create({
        data: { channelId: channel.id, userId: user.id, role: 'owner' },
      });
    });
  } catch (error) {
    if (error instanceof InviteCodeError) {
      return false;
    }
    throw error;
  }

  return true;
}
