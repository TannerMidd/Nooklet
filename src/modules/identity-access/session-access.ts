type SessionLike = {
  user?: {
    mustChangePassword?: boolean;
  } | null;
} | null | undefined;

export type SessionAccessState = "anonymous" | "password_change_required" | "ready";

/**
 * Keeps the temporary-password policy identical at page, API, and Server
 * Action boundaries without coupling the edge-compatible proxy to auth.ts.
 */
export function classifySessionAccess(session: SessionLike): SessionAccessState {
  if (!session?.user) {
    return "anonymous";
  }

  return session.user.mustChangePassword === true
    ? "password_change_required"
    : "ready";
}
