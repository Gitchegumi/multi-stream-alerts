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

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
  },
  providers: [
    CredentialsProvider({
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });
        if (!user || !user.passwordHash) return null;
        if (!verifyPassword(credentials.password, user.passwordHash)) return null;
        return {
          id: user.id,
          email: user.email,
          role: user.role,
          name: user.displayName,
        };
      },
    }),
    // Generic OIDC provider. NextAuth's `oauth.js` base provider does
    // OIDC discovery automatically when given an `issuer` (or
    // `wellKnown`) field, so this single config works with any
    // OIDC-compliant IdP (Authentik, Keycloak, Okta, Authing, Azure AD,
    // Google, etc.). Set the three env vars and you're done.
    {
      id: 'oidc',
      name: process.env.AUTH_OIDC_PROVIDER_NAME ?? 'OIDC',
      type: 'oauth',
      // Both `issuer` and `wellKnown` are required. NextAuth's
      // openid-client adapter only runs OIDC discovery when a
      // `wellKnown` URL is present; without it, next-auth constructs
      // the Issuer from explicit fields (provider.authorization.url,
      // provider.token.url, etc.) and throws
      // "authorization_endpoint must be configured on the issuer" the
      // moment we try to build the authorization URL. Setting
      // `wellKnown` triggers the discovery fetch and pulls every
      // endpoint (authorization, token, userinfo, jwks, end_session)
      // from the IdP's well-known document.
      issuer: oidcIssuer,
      wellKnown: `${oidcIssuer}/.well-known/openid-configuration`,
      clientId: process.env.AUTH_OIDC_CLIENT_ID ?? '<your-oidc-client-id>',
      clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? '<your-oidc-client-secret>',
      authorization: { params: { scope: 'openid email profile' } },
      checks: ['pkce', 'state', 'nonce'],
      profile(profile) {
        return {
          id: profile.sub ?? profile.email ?? '',
          email: profile.email,
          name: profile.name ?? profile.preferred_username ?? profile.email,
        };
      },
    },
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'credentials') {
        return true;
      }

      const oidcProfile = profile as OidcProfile | undefined;
      if (oidcProfile?.email_verified === false) {
        // Visibility-only; we don't deny the sign-in for the reason
        // documented on the OidcProfile type above.
        console.warn('OIDC sign-in arrived with email_verified=false', {
          email: oidcProfile.email,
        });
      }
      // For OIDC, the OAuth `sub` claim (from the ID token) is the canonical
      // stable identifier and is what Auth.js stores on `account.providerAccountId`.
      // We prefer `profile.sub` because it is what the IdP actually asserted;
      // `account.providerAccountId` is the same value re-exposed by Auth.js.
      // If both are missing, sign-in is rejected below — we never key a local
      // user record off an unverifiable identity.
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

      // First-time OIDC login for an unknown user. The only paths to a
      // new account are:
      //   (a) the email matches INITIAL_ADMIN_EMAIL — bootstraps the
      //       first admin with no invite code required.
      //   (b) a valid invite code was stashed in the ga_signup_invite
      //       cookie by the /register page — required for every other
      //       first-time login.
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

      // Pull the invite code from the short-lived cookie set by
      // /register. We also clear it here so a successful sign-in does
      // not leave a stale code around for the next visit.
      const cookieJar = await cookies();
      const rawInvite = cookieJar.get(INVITE_CODE_COOKIE)?.value;
      const inviteValidation = validateInviteCodeForCookie(rawInvite);
      if (!inviteValidation.ok) {
        return false;
      }
      try {
        cookieJar.delete(INVITE_CODE_COOKIE);
      } catch {
        // The cookie may have been set in a different request scope;
        // ignoring a delete failure is safe — at worst the cookie
        // expires on its 10-minute maxAge.
      }

      // Provision the new user, redeem the invite, and create their
      // personal channel + membership in a single transaction. If any
      // step fails, the whole write is rolled back — no orphaned user
      // row, no half-claimed invite, no channel without an owner.
      try {
        await prisma.$transaction(async (tx) => {
          // Find the invite inside the transaction so the pre-flight
          // validation reads the same row version the redemption will
          // write against. The atomic re-check inside
          // `redeemInviteCodeInTransaction` is still authoritative.
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

          // Apply the role the invite assigned (the user was created
          // as viewer above; the invite can promote to owner/admin/etc.).
          if (redeemed.role !== 'viewer') {
            await tx.user.update({ where: { id: user.id }, data: { role: redeemed.role } });
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
        // Anything else (P2002 race, connection drop, etc.) propagates
        // — the transaction has already rolled back so the user row is
        // not consumed.
        throw error;
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      if (token.userId && token.role) {
        return token;
      }

      // If this is a credentials sign-in, the `authorize` callback already
      // returned an object with id/email/role/name. NextAuth puts those
      // into the user object, not the account/profile, but we can still
      // hydrate from the token email if needed.
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
              authProvider_authSubject: { authProvider: account?.provider ?? 'oidc', authSubject },
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
