import "server-only";

import { headers } from "next/headers";
import { getToken } from "next-auth/jwt";

import { env } from "@/lib/env";
import { revokeAuthSession } from "@/modules/identity-access/repositories/auth-session-repository";

/**
 * Revoke the durable session identified by the raw encrypted Auth.js cookie.
 * This deliberately bypasses `auth()`: that helper converts JWT callback
 * failures into an anonymous session, which is unsafe for fail-closed logout.
 */
export async function revokeRequestAuthSession(request?: Request) {
  const requestWithCookies = request ?? {
    headers: await headers(),
  };
  const token = await getToken({
    req: requestWithCookies,
    secret: env.AUTH_SECRET,
    secureCookie: new URL(env.APP_URL).protocol === "https:",
  });

  if (
    typeof token?.authSessionId !== "string"
    || token.authSessionId.length === 0
    || typeof token.sub !== "string"
    || token.sub.length === 0
  ) {
    return false;
  }

  await revokeAuthSession(token.authSessionId, token.sub);
  return true;
}
