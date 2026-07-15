import { and, asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { users } from "@/lib/database/schema";

/**
 * Returns the administrator whose server-level configuration can be consumed
 * by another account. Existing per-user configuration is resolved by each
 * repository before using this fallback, which keeps old installations
 * working without copying secrets or rewriting foreign keys.
 */
export async function resolveInstanceConfigurationOwnerId(userId: string) {
  const database = ensureDatabaseReady();
  const currentUser = database
    .select({ id: users.id, role: users.role, isDisabled: users.isDisabled })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  if (!currentUser || (currentUser.role === "admin" && !currentUser.isDisabled)) {
    return userId;
  }

  return database
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "admin"), eq(users.isDisabled, false)))
    .orderBy(asc(users.createdAt), asc(users.id))
    .limit(1)
    .get()?.id ?? userId;
}
