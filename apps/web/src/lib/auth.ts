import type { NextAuthOptions, Profile } from 'next-auth';
import { cookies } from 'next/headers';
import {
  prisma,
  redeemInviteCodeInTransaction,
  assertInviteIsUsable,
  InviteCodeError,
  type Prisma,
} from '@multi-stream-alerts/database';
import { INVITE_CODE_COOKIE, validateInviteCodeForCookie } from './oidc-state';
import { generateUniqueChannelSlugSync } from './channel-slug';

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

      const oidcProfile = profile as OidcProfile | undefined;
      const authSubject = oidcProfile?.sub ?? account?.providerAccountId;

      const dbUser = authSubject
        ? await prisma.user.findUnique({
            where: {
              authProvider_authSubject: { authProvider: account?.provider ?? 'oidc', authSubject },
            },
          })
        : token.email
          ? await prisma.user.findUnique({ where: { email: token.email } })
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

/**
 * Maximum number of slug-generation attempts before giving up. The
 * random suffix is 8 hex chars (32 bits of entropy) so a collision
 * probability per attempt is ~1 in 4 billion; 5 attempts makes the
 * total probability of giving up astronomically small. If we ever do
 * hit the cap, we let the underlying P2002 propagate and fail the
 * transaction — we'd rather refuse a signup than ever return a
 * non-unique slug.
 */
const MAX_CHANNEL_SLUG_ATTEMPTS = 5;

/**
 * Create a Channel row with a slug guaranteed to be unique in the
 * database, retrying on P2002 (unique-violation) collisions. Must be
 * called inside a `prisma.$transaction` so the `findUnique` + `create`
 * pair sees a consistent view of the channel table.
 */
async function createChannelWithUniqueSlug(
  tx: Prisma.TransactionClient,
  preferredName: string,
  email: string,
  ownerUserId: string,
) {
  for (let attempt = 0; attempt < MAX_CHANNEL_SLUG_ATTEMPTS; attempt += 1) {
    const slug = generateUniqueChannelSlugSync(email);
    try {
      return await tx.channel.create({
        data: { name: preferredName, slug, ownerUserId },
      });
    } catch (error) {
      if (isUniqueConstraintError(error) && attempt < MAX_CHANNEL_SLUG_ATTEMPTS - 1) {
        continue;
      }
      throw error;
    }
  }
  // Unreachable: the loop either returns or throws on the last
  // iteration. Belt-and-suspenders to satisfy the type checker.
  throw new Error('channel slug collision retry exhausted');
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002',
  );
}
