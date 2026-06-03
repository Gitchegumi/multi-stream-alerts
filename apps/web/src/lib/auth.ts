import type { NextAuthOptions, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { cookies } from 'next/headers';
import {
  prisma,
  redeemInviteCodeInTransaction,
  assertInviteIsUsable,
  InviteCodeError,
  verifyPassword,
  type Prisma,
} from '@multi-stream-alerts/database';
import { INVITE_CODE_COOKIE, validateInviteCodeForCookie } from './oidc-state';
import { createChannelWithUniqueSlug } from './channel-slug';

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

function buildOidcProvider() {
  return {
    id: 'oidc' as const,
    name: process.env.AUTH_OIDC_PROVIDER_NAME ?? 'OIDC',
    type: 'oauth' as const,
    issuer: oidcIssuer,
    wellKnown: `${oidcIssuer}/.well-known/openid-configuration`,
    clientId: process.env.AUTH_OIDC_CLIENT_ID ?? '<your-oidc-client-id>',
    clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? '<your-oidc-client-secret>',
    authorization: { params: { scope: 'openid email profile' } },
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
      const valid = await verifyPassword(
        credentials.password,
        user.localCredential.passwordHash,
      );
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

      const authSubject = oidcProfile?.sub ?? account?.providerAccountId;
      const email = oidcProfile?.email;

      if (!account || !authSubject || !email) {
        return false;
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ authProvider: account.provider, authSubject }, { email }],
        },
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            authProvider: account.provider,
            authSubject,
            displayName: oidcProfile?.name ?? existingUser.displayName,
          },
        });
        return true;
      }

      // First-time OIDC login for an unknown user.
      const isInitialAdmin = email === process.env.INITIAL_ADMIN_EMAIL;
      if (isInitialAdmin) {
        await prisma.user.create({
          data: {
            authProvider: account.provider,
            authSubject,
            email,
            displayName: oidcProfile?.name ?? email,
            role: 'admin',
          },
        });
        return true;
      }

      const cookieJar = await cookies();
      const rawInvite = cookieJar.get(INVITE_CODE_COOKIE)?.value;
      const inviteValidation = validateInviteCodeForCookie(rawInvite);
      if (!inviteValidation.ok) {
        return false;
      }
      try {
        cookieJar.delete(INVITE_CODE_COOKIE);
      } catch {
        /* cookie may be in a different request scope; safe to ignore */
      }

      try {
        await prisma.$transaction(async (tx) => {
          const invite = await tx.inviteCode.findUnique({
            where: { code: inviteValidation.inviteCode },
          });
          if (!invite) {
            throw new InviteCodeError('INVALID', 'Invite code not found');
          }
          assertInviteIsUsable(invite);

          const user = await tx.user.create({
            data: {
              authProvider: account.provider,
              authSubject,
              email,
              displayName: oidcProfile?.name ?? email,
              role: 'viewer',
            },
          });

          const redeemed = await redeemInviteCodeInTransaction(tx, {
            invite,
            userId: user.id,
          });

          if (redeemed.role !== 'viewer') {
            await tx.user.update({
              where: { id: user.id },
              data: { role: redeemed.role },
            });
          }

          const channel = await createChannelWithUniqueSlug(
            tx,
            oidcProfile?.name ?? email.split('@')[0] ?? 'My Channel',
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
    },
    async jwt({ token, account, profile }) {
      if (token.userId && token.role) {
        return token;
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

export { oidcEnabled, credentialsEnabled };
