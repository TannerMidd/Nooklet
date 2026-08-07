import { and, asc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { instanceConfiguration, users } from "@/lib/database/schema";

const singletonConfigurationId = "default";

/**
 * Returns the stable owner of server-level configuration. The identity is
 * persisted once and deliberately survives role changes and account disable
 * operations, so adding a second administrator cannot silently switch the
 * instance to a different set of indexers, connections, or library paths.
 */
export async function resolveInstanceConfigurationOwnerId(userId: string) {
  const database = ensureDatabaseReady();

  return database.transaction((tx) => {
    const storedOwner = tx
      .select({ ownerUserId: instanceConfiguration.ownerUserId })
      .from(instanceConfiguration)
      .where(eq(instanceConfiguration.id, singletonConfigurationId))
      .get();

    if (storedOwner) return storedOwner.ownerUserId;

    const currentUser = tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!currentUser) return userId;

    const firstActiveAdmin = tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isDisabled, false)))
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1)
      .get();
    const firstUser = firstActiveAdmin ?? tx
      .select({ id: users.id })
      .from(users)
      .orderBy(asc(users.createdAt), asc(users.id))
      .limit(1)
      .get();
    const ownerUserId = firstUser?.id ?? userId;

    tx.insert(instanceConfiguration)
      .values({ id: singletonConfigurationId, ownerUserId })
      .onConflictDoNothing({ target: instanceConfiguration.id })
      .run();

    return tx
      .select({ ownerUserId: instanceConfiguration.ownerUserId })
      .from(instanceConfiguration)
      .where(eq(instanceConfiguration.id, singletonConfigurationId))
      .get()?.ownerUserId ?? ownerUserId;
  });
}
