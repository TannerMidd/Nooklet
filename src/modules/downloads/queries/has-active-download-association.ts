import { and, eq, inArray, or } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  activeDownloadRequestStatuses,
  downloadFulfillments,
  downloadImportRuns,
  downloadQueueItems,
  downloadRequests,
  engineDownloads,
} from "@/lib/database/schema";

const activeQueueItemStatuses = ["queued", "downloading", "paused"] as const;
const activeEngineDownloadStates = [
  "queued",
  "fetching",
  "assembling",
  "repairing",
  "extracting",
  "paused",
] as const;
const activeImportRunStatuses = ["pending", "running"] as const;
const openFulfillmentStatuses = ["active", "retry_wait", "partial"] as const;

/**
 * A title cannot be removed while a durable season plan or any physical part
 * of its download lifecycle is live. Looking at every persisted phase also
 * protects against a stale request status paired with a still-active
 * downloader or import record.
 */
export async function hasActiveDownloadAssociationForTitle(
  userId: string,
  titleId: string,
) {
  const database = ensureDatabaseReady();

  const openFulfillment = database
    .select({ id: downloadFulfillments.id })
    .from(downloadFulfillments)
    .where(and(
      eq(downloadFulfillments.userId, userId),
      eq(downloadFulfillments.mediaTitleId, titleId),
      inArray(downloadFulfillments.status, [...openFulfillmentStatuses]),
    ))
    .limit(1)
    .get();

  if (openFulfillment) return true;

  return Boolean(database
    .select({ id: downloadRequests.id })
    .from(downloadRequests)
    .leftJoin(
      downloadQueueItems,
      and(
        eq(downloadQueueItems.requestId, downloadRequests.id),
        eq(downloadQueueItems.userId, userId),
      ),
    )
    .leftJoin(
      engineDownloads,
      and(
        eq(engineDownloads.id, downloadQueueItems.externalQueueId),
        eq(engineDownloads.userId, userId),
      ),
    )
    .leftJoin(
      downloadImportRuns,
      and(
        eq(downloadImportRuns.requestId, downloadRequests.id),
        eq(downloadImportRuns.userId, userId),
      ),
    )
    .where(and(
      eq(downloadRequests.userId, userId),
      eq(downloadRequests.mediaTitleId, titleId),
      or(
        inArray(downloadRequests.status, [...activeDownloadRequestStatuses]),
        inArray(downloadQueueItems.status, [...activeQueueItemStatuses]),
        inArray(engineDownloads.state, [...activeEngineDownloadStates]),
        inArray(downloadImportRuns.status, [...activeImportRunStatuses]),
      ),
    ))
    .limit(1)
    .get());
}

/**
 * A destination folder cannot disappear while a request targets it or an
 * import job is actively writing into it.
 */
export async function hasActiveDownloadAssociationForLibraryPath(
  userId: string,
  pathId: string,
) {
  const database = ensureDatabaseReady();

  return Boolean(database
    .select({ id: downloadRequests.id })
    .from(downloadRequests)
    .leftJoin(
      downloadQueueItems,
      and(
        eq(downloadQueueItems.requestId, downloadRequests.id),
        eq(downloadQueueItems.userId, userId),
      ),
    )
    .leftJoin(
      engineDownloads,
      and(
        eq(engineDownloads.id, downloadQueueItems.externalQueueId),
        eq(engineDownloads.userId, userId),
      ),
    )
    .leftJoin(
      downloadImportRuns,
      and(
        eq(downloadImportRuns.requestId, downloadRequests.id),
        eq(downloadImportRuns.userId, userId),
      ),
    )
    .where(and(
      eq(downloadRequests.userId, userId),
      or(
        and(
          eq(downloadRequests.targetLibraryPathId, pathId),
          or(
            inArray(downloadRequests.status, [...activeDownloadRequestStatuses]),
            inArray(downloadQueueItems.status, [...activeQueueItemStatuses]),
            inArray(engineDownloads.state, [...activeEngineDownloadStates]),
          ),
        ),
        and(
          eq(downloadImportRuns.libraryPathId, pathId),
          inArray(downloadImportRuns.status, [...activeImportRunStatuses]),
        ),
      ),
    ))
    .limit(1)
    .get());
}
