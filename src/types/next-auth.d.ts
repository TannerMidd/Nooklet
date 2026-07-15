import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: "admin" | "user";
      mustChangePassword: boolean;
    };
  }

  interface User {
    role: "admin" | "user";
    mustChangePassword?: boolean;
    passwordChangedAt?: number;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "user";
    mustChangePassword?: boolean;
    pwdChangedAt?: number;
  }
}
