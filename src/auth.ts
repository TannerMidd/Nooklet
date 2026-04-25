import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { env } from "@/lib/env";
import { loginInputSchema } from "@/modules/identity-access/schemas/login";
import { authenticateWithPassword } from "@/modules/identity-access/workflows/authenticate-with-password";
import { getBootstrapStatus } from "@/modules/identity-access/workflows/bootstrap-status";

export const { handlers, signIn, signOut, auth } = NextAuth({
  secret: env.AUTH_SECRET,
  session: {
    strategy: "jwt",
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
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
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
