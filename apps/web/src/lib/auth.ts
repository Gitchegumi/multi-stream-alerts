import type { NextAuthOptions, Profile } from "next-auth";
import AuthentikProvider from "next-auth/providers/authentik";
import { prisma } from "@multi-stream-alerts/database";
import { parseBooleanEnv } from "@multi-stream-alerts/shared";

type OidcProfile = Profile & {
  sub?: string;
  email?: string;
  name?: string;
  preferred_username?: string;
};

const oidcIssuer = (process.env.AUTH_OIDC_ISSUER ?? "https://<your-oidc-provider>/<issuer-path>").replace(/\/+$/, "");

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
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
    })
  ],
  callbacks: {
    async signIn({ account, profile }) {
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
    async jwt({ token, account, profile }) {
      if (token.userId && token.role) {
        return token;
      }

      const oidcProfile = profile as OidcProfile | undefined;
      const authSubject = oidcProfile?.sub ?? account?.providerAccountId;

      const user = authSubject
        ? await prisma.user.findUnique({
            where: { authProvider_authSubject: { authProvider: account?.provider ?? "oidc", authSubject } }
          })
        : token.email
          ? await prisma.user.findUnique({ where: { email: token.email } })
          : null;

      if (user) {
        token.userId = user.id;
        token.role = user.role;
        token.email = user.email;
        token.name = user.displayName ?? user.email;
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
