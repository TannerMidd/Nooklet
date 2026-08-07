import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { trustedClientAddress } from "@/lib/security/rate-limit-key";
import { buildLoginRateLimits } from "@/lib/security/login-rate-limit";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";
import { authenticateWithPassword } from "@/modules/identity-access/workflows/authenticate-with-password";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";
import { findUserById } from "@/modules/users/repositories/user-repository";

process.env.AUTH_URL ??= env.APP_URL;

export const authCallbacks = {
  async jwt({ token, user }) {
    if (user) {
      token.role = user.role;
      token.mustChangePassword = user.mustChangePassword;
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
      const tokenPwdChangedAt = token.pwdChangedAt;
      if (typeof tokenPwdChangedAt !== "number" || !Number.isFinite(tokenPwdChangedAt)) {
        // Tokens issued before password-version claims existed cannot prove
        // that they predate neither a reset nor an account takeover recovery.
        // Fail closed once, requiring those legacy sessions to sign in again.
        return null;
      }
      if (tokenPwdChangedAt < currentPwdChangedAt) {
        return null;
      }

      token.role = currentUser.role;
      token.mustChangePassword = currentUser.mustChangePassword;
    }

    return token;
  },
  session({ session, token }) {
    if (session.user) {
      session.user.id = token.sub ?? "";
      session.user.role = token.role === "admin" ? "admin" : "user";
      session.user.mustChangePassword = token.mustChangePassword === true;
    }

    return session;
  },
} satisfies NonNullable<NextAuthConfig["callbacks"]>;

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  // Self-hosted deployments sit behind reverse proxies and bind to arbitrary
  // hostnames, so we explicitly trust the incoming Host header. Operators are
  // expected to terminate TLS and restrict ingress at the proxy layer.
  trustHost: true,
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
      authorize: async (credentials, request) => {
        const parsedCredentials = loginInputSchema.safeParse(credentials);

        if (!parsedCredentials.success) {
          return null;
        }

        const normalizedEmail = parsedCredentials.data.email.trim().toLowerCase();
        const clientAddress = trustedClientAddress(request);
        const loginRateLimits = buildLoginRateLimits({
          clientAddress,
          normalizedEmail,
          password: parsedCredentials.data.password,
        });
        const sourceRateLimit = consumeRateLimit(loginRateLimits.source);

        if (!sourceRateLimit.ok) {
          return null;
        }

        const bootstrapStatus = await getBootstrapStatus();

        if (bootstrapStatus.isOpen) {
          return null;
        }

        const accountRateLimit = consumeRateLimit(loginRateLimits.accountOrCandidate);

        if (!accountRateLimit.ok) {
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
          mustChangePassword: user.mustChangePassword,
          passwordChangedAt: user.passwordChangedAt,
        };
      },
    }),
  ],
  callbacks: authCallbacks,
});
