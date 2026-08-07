import NextAuth, { type NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { trustedClientAddress } from "@/lib/security/rate-limit-key";
import { buildLoginRateLimits } from "@/lib/security/login-rate-limit";
import {
  AUTH_SESSION_MAX_AGE_SECONDS,
  isAuthSessionActive,
  issueAuthSession,
  revokeAuthSession,
} from "@/modules/identity-access/repositories/auth-session-repository";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";
import { authenticateWithPassword } from "@/modules/identity-access/workflows/authenticate-with-password";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";
import { findUserById } from "@/modules/users/repositories/user-repository";

process.env.AUTH_URL ??= env.APP_URL;

export const authCallbacks = {
  async jwt({ token, user }) {
    if (user) {
      if (
        !user.id
        || typeof user.authGeneration !== "number"
        || !Number.isSafeInteger(user.authGeneration)
        || user.authGeneration < 0
        || typeof user.passwordChangedAt !== "number"
        || !Number.isSafeInteger(user.passwordChangedAt)
      ) {
        return null;
      }

      const authGeneration = user.authGeneration as number;
      const passwordChangedAt = user.passwordChangedAt as number;
      const authSession = await issueAuthSession(
        user.id,
        authGeneration,
        passwordChangedAt,
      );
      if (!authSession) return null;

      token.role = user.role;
      token.mustChangePassword = user.mustChangePassword;
      token.pwdChangedAt = passwordChangedAt;
      token.authGeneration = authGeneration;
      token.authSessionId = authSession.id;
      return token;
    }

    // On subsequent requests, validate the token against the live user record so
    // disabled accounts and password changes invalidate existing sessions.
    if (token.sub) {
      const authSessionId = token.authSessionId;
      const authGeneration = token.authGeneration;
      if (
        typeof authSessionId !== "string"
        || authSessionId.length === 0
        || typeof authGeneration !== "number"
        || !Number.isSafeInteger(authGeneration)
        || authGeneration < 0
      ) {
        return null;
      }

      const [currentUser, activeSession] = await Promise.all([
        findUserById(token.sub),
        isAuthSessionActive(authSessionId, token.sub, authGeneration as number),
      ]);

      if (
        !activeSession
        || !currentUser
        || currentUser.isDisabled
        || currentUser.authGeneration !== authGeneration
      ) {
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
      if (tokenPwdChangedAt !== currentPwdChangedAt) {
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

export const authEvents = {
  async signOut(message) {
    if (
      "token" in message
      && typeof message.token?.authSessionId === "string"
      && typeof message.token.sub === "string"
    ) {
      await revokeAuthSession(message.token.authSessionId, message.token.sub);
    }
  },
} satisfies NonNullable<NextAuthConfig["events"]>;

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  // Self-hosted deployments sit behind reverse proxies and bind to arbitrary
  // hostnames, so we explicitly trust the incoming Host header. Operators are
  // expected to terminate TLS and restrict ingress at the proxy layer.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: AUTH_SESSION_MAX_AGE_SECONDS,
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
          authGeneration: user.authGeneration,
        };
      },
    }),
  ],
  callbacks: authCallbacks,
  events: authEvents,
});
