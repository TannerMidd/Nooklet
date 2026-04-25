import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";
import { authenticateWithPassword } from "@/modules/identity-access/workflows/authenticate-with-password";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";
import { findUserById } from "@/modules/users/repositories/user-repository";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60,
    updateAge: 60 * 60,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Local login",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      authorize: async (credentials) => {
        const parsedCredentials = loginInputSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const normalizedEmail = parsedCredentials.data.email.trim().toLowerCase();
        const rateLimit = consumeRateLimit({
          key: `login:${normalizedEmail}`,
          limit: 10,
          windowMs: 5 * 60 * 1000,
        });

        if (!rateLimit.ok) {
          return null;
        }

        const bootstrapStatus = await getBootstrapStatus();

        if (bootstrapStatus.isOpen) {
          return null;
        }

        const user = await authenticateWithPassword(parsedCredentials.data);

        if (!user) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          role: user.role,
          passwordChangedAt: user.passwordChangedAt,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.pwdChangedAt = user.passwordChangedAt;
        return token;
      }

      // On subsequent requests, validate the token against the live user record so
      // disabled accounts and password changes invalidate existing sessions.
      if (token.sub) {
        const currentUser = await findUserById(token.sub);

        if (!currentUser || currentUser.isDisabled) {
          return null;
        }

        const currentPwdChangedAt = currentUser.passwordChangedAt.getTime();
        const tokenPwdChangedAt = typeof token.pwdChangedAt === "number" ? token.pwdChangedAt : null;
        if (tokenPwdChangedAt !== null && tokenPwdChangedAt < currentPwdChangedAt) {
          return null;
        }

        token.role = currentUser.role;
      }

      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role === "admin" ? "admin" : "user";
      }

      return session;
    },
  },
});
