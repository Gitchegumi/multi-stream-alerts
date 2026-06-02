import type { NextAuthOptions, Profile } from "next-auth";
import { cookies } from "next/headers";
import {
  prisma,
  findInviteByCode,
  redeemInviteCode,
  assertInviteIsUsable,
  InviteCodeError
} from "@multi-stream-alerts/database";
import type { UserRole } from "@multi-stream-alerts/database";
import { INVITE_CODE_COOKIE, validateInviteCodeForCookie } from "./oidc-state";

type OidcProfile = Profile & {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
};

const oidcIssuer = (process.env.AUTH_OIDC_ISSUER ?? "https://<your-oidc-provider>/<issuer-path>").replace(/\/+$/, "");

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin"
  },
  providers: [
    // Generic OIDC provider. NextAuth's `oauth.js` base provider does
    // OIDC discovery automatically when given an `issuer` (or
    // `wellKnown`) field, so this single config works with any
    // OIDC-compliant IdP (Authentik, Keycloak, Okta, Authing, Azure AD,
    // Google, etc.). Set the three env vars and you're done.
    {
      id: "oidc",
      name: process.env.AUTH_OIDC_PROVIDER_NAME ?? "OIDC",
      type: "oauth",
      issuer: oidcIssuer,
      clientId: process.env.AUTH_OIDC_CLIENT_ID ?? "<your-oidc-client-id>",
      clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? "<your-oidc-client-secret>",
      authorization: { params: { scope: "openid email profile" } },
      checks: ["pkce", "state", "nonce"],
      profile(profile) {
        return {
          id: profile.sub ?? profile.email ?? "",
          email: profile.email,
          name: profile.name ?? profile.preferred_username ?? profile.email
        };
      }
    }
  ],
  callbacks: {
    async signIn({ account, profile }) {
      const oidcProfile = profile as OidcProfile | undefined;
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
          OR: [
            { authProvider: account.provider, authSubject },
            { email }
          ]
        }
      });

      if (existingUser) {
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            authProvider: account.provider,
            authSubject,
            displayName: oidcProfile?.name ?? existingUser.displayName
          }
        });
        return true;
      }

      // First-time OIDC login for an unknown user. The only paths to a
      // new account are:
      //   (a) the email matches INITIAL_ADMIN_EMAIL — bootstraps the
      //       first admin with no invite code required.
      //   (b) a valid invite code was stashed in the ga_signup_invite
      //       cookie by the /register page — required for any other
      //       first-time login, even if ALLOW_AUTO_PROVISION=true.
      const isInitialAdmin = email === process.env.INITIAL_ADMIN_EMAIL;
      if (isInitialAdmin) {
        await prisma.user.create({
          data: {
            authProvider: account.provider,
            authSubject,
            email,
            displayName: oidcProfile?.name ?? email,
            role: "admin"
          }
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

      // Pre-flight: fail fast on a clearly invalid code before we touch
      // the database transaction. The atomic re-check inside
      // `redeemInviteCode` is still authoritative.
      const invite = await findInviteByCode(inviteValidation.inviteCode);
      if (!invite) {
        return false;
      }
      try {
        assertInviteIsUsable(invite);
      } catch {
        return false;
      }

      // Create the user row first. The redemption is keyed off the real
      // user id so the (inviteCodeId, userId) unique is satisfied with
      // the real identity on the first try.
      let createdUserId: string;
      try {
        const user = await prisma.user.create({
          data: {
            authProvider: account.provider,
            authSubject,
            email,
            displayName: oidcProfile?.name ?? email,
            role: "viewer"
          }
        });
        createdUserId = user.id;
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return false;
        }
        throw error;
      }

      // Redeem the invite. On failure, roll back the user we just created
      // so the email is not silently consumed.
      let redeemedRole: UserRole = "viewer";
      try {
        const redeemed = await redeemInviteCode({
          code: inviteValidation.inviteCode,
          userId: createdUserId
        });
        redeemedRole = redeemed.role;
      } catch (error) {
        await prisma.user.delete({ where: { id: createdUserId } }).catch(() => undefined);
        if (error instanceof InviteCodeError) {
          return false;
        }
        throw error;
      }

      // Apply the role the invite assigned (the user was created as
      // viewer above; the invite can promote to owner/admin/etc.).
      if (redeemedRole !== "viewer") {
        await prisma.user.update({ where: { id: createdUserId }, data: { role: redeemedRole } });
      }

      // Provision a personal channel for the new user.
      const channel = await prisma.channel.create({
        data: {
          name: oidcProfile?.name ?? email.split("@")[0] ?? "My Channel",
          slug: await generateUniqueChannelSlug(email),
          ownerUserId: createdUserId
        }
      });

      await prisma.channelMembership.create({
        data: { channelId: channel.id, userId: createdUserId, role: "owner" }
      });

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
            where: { authProvider_authSubject: { authProvider: account?.provider ?? "oidc", authSubject } }
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
        throw new Error("Missing authenticated user");
      }

      session.user.id = token.userId;
      session.user.role = token.role;
      return session;
    }
  }
};

async function generateUniqueChannelSlug(email: string): Promise<string> {
  const base = email
    .split("@")[0]
    ?.toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "user";
  const candidate = `${base}-${Math.random().toString(16).slice(2, 8)}`;
  const existing = await prisma.channel.findUnique({ where: { slug: candidate } });
  if (existing) {
    return `${candidate}-${Math.random().toString(16).slice(2, 8)}`;
  }
  return candidate;
}

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(
    error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002"
  );
}
