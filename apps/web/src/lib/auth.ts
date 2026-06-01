import type { NextAuthOptions, Profile } from "next-auth";
import AuthentikProvider from "next-auth/providers/authentik";
import CredentialsProvider from "next-auth/providers/credentials";
import { prisma } from "@multi-stream-alerts/database";
import type { UserRole } from "@multi-stream-alerts/database";
import { parseBooleanEnv } from "@multi-stream-alerts/shared";
import { authenticateLocalUser } from "./local-auth";

type OidcProfile = Profile & {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

const oidcIssuer = (process.env.AUTH_OIDC_ISSUER ?? "https://<your-oidc-provider>/<issuer-path>").replace(/\/+$/, "");

const localRegistrationEnabled = process.env.ENABLE_LOCAL_REGISTRATION !== "false";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin"
  },
  providers: [
    AuthentikProvider({
      id: "oidc",
      name: "OIDC",
      issuer: oidcIssuer,
      clientId: process.env.AUTH_OIDC_CLIENT_ID ?? "<your-oidc-client-id>",
      clientSecret: process.env.AUTH_OIDC_CLIENT_SECRET ?? "<your-oidc-client-secret>",
      authorization: { params: { scope: "openid email profile" } },
      profile(profile) {
        return {
          id: profile.sub ?? profile.email ?? "",
          email: profile.email,
          name: profile.name ?? profile.preferred_username ?? profile.email
        };
      }
    }),
    ...(localRegistrationEnabled
      ? [
          CredentialsProvider({
            id: "credentials",
            name: "Email & Password",
            credentials: {
              email: { label: "Email", type: "email" },
              password: { label: "Password", type: "password" }
            },
            async authorize(rawCredentials) {
              const result = await authenticateLocalUser(rawCredentials);
              if (!result.ok) {
                return null;
              }
              return {
                id: result.userId,
                email: result.email,
                name: result.displayName ?? result.email,
                role: result.role
              };
            }
          })
        ]
      : [])
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "credentials") {
        // Credentials users are validated inside authorize() and the
        // resulting user record is the only thing we trust.
        return Boolean(account.providerAccountId);
      }

      const oidcProfile = profile as OidcProfile | undefined;
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

      const isInitialAdmin = email === process.env.INITIAL_ADMIN_EMAIL;
      if (!isInitialAdmin && !parseBooleanEnv(process.env.ALLOW_AUTO_PROVISION)) {
        return false;
      }

      await prisma.user.create({
        data: {
          authProvider: account.provider,
          authSubject,
          email,
          displayName: oidcProfile?.name ?? email,
          role: isInitialAdmin ? "admin" : "viewer"
        }
      });

      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (token.userId && token.role) {
        return token;
      }

      // Credentials sign-ins arrive with a fully populated `user` object
      // from `authorize()`. Hydrate the token directly from it.
      if (account?.provider === "credentials" && user) {
        const credentialsUser = user as { id?: string; role?: UserRole; email?: string | null; name?: string | null };
        if (credentialsUser.id && credentialsUser.role) {
          token.userId = credentialsUser.id;
          token.role = credentialsUser.role;
          token.email = credentialsUser.email ?? token.email;
          token.name = credentialsUser.name ?? token.name;
          return token;
        }
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
