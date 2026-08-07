import { and, lt, lte, ne } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  auditEvents,
  authSessions,
  notificationDispatchAudit,
  recommendationItemTimelineEvents,
  watchHistorySyncRuns,
} from "@/lib/database/schema";
import { env } from "@/lib/env";

const dayMs = 24 * 60 * 60 * 1_000;

/**
 * Bound append-only operational records without deleting recommendation or
 * watch-history content itself. Pending syncs are retained regardless of age.
 */
export async function pruneOperationalHistory(options: {
  now?: Date;
  retentionDays?: number;
} = {}) {
  const now = options.now ?? new Date();
  const retentionDays = options.retentionDays ?? env.OPERATIONAL_RETENTION_DAYS;
  const cutoff = new Date(now.getTime() - retentionDays * dayMs);
  const database = ensureDatabaseReady();

  return database.transaction((tx) => ({
    expiredAuthSessions: tx.delete(authSessions)
      .where(lte(authSessions.expiresAt, now))
      .run().changes,
    auditEvents: tx.delete(auditEvents)
      .where(lt(auditEvents.createdAt, cutoff))
      .run().changes,
    notificationDispatches: tx.delete(notificationDispatchAudit)
      .where(lt(notificationDispatchAudit.dispatchedAt, cutoff))
      .run().changes,
    recommendationTimelineEvents: tx.delete(recommendationItemTimelineEvents)
      .where(lt(recommendationItemTimelineEvents.createdAt, cutoff))
      .run().changes,
    watchHistorySyncRuns: tx.delete(watchHistorySyncRuns)
      .where(and(
        ne(watchHistorySyncRuns.status, "pending"),
        lt(watchHistorySyncRuns.createdAt, cutoff),
      ))
      .run().changes,
  }));
}
