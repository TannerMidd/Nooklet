import {
  type SabnzbdHistorySnapshot,
  type SabnzbdQueueSnapshot,
} from "@/lib/integrations/sabnzbd";
import {
  incrementDownloadRequestMissingTickCount,
  incrementDownloadRequestRetryCount,
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
  resetDownloadRequestMissingTickCount,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { type ResolvedImportSabnzbdClient } from "../import-completed-downloads/client-resolution";

type ActiveDownloadRequest = Awaited<ReturnType<typeof listActiveDownloadRequestsForImport>>[number];

export type MissingQueueItemRetryResult = {
  missingCount: number;
  attemptedCount: number;
  queuedCount: number;
  failedCount: number;
  graceCount: number;
  awaitingImportCount: number;
};

const missingQueueMessage =
  "SABnzbd queue item is no longer present. It may have been removed manually.";
const exhaustedRetriesMessage =
  "SABnzbd queue item is no longer present and the automatic retry budget is exhausted.";
export const MIN_SAB_VISIBILITY_WINDOW_MS = 5 * 60 * 1000;
export const MISSING_TICKS_THRESHOLD = 4;
export const MAX_MISSING_RETRY_COUNT = 3;

function retryKey(mediaTitleId: string | null, episodeId: string | null) {
  if (!mediaTitleId) {
    return null;
  }

  return `${mediaTitleId}:${episodeId ?? "movie"}`;
}

function isTrackedActiveDownload(entry: ActiveDownloadRequest) {
  return ["queued", "downloading", "requeuing"].includes(entry.request.status)
    && ["queued", "downloading"].includes(entry.queueItem.status);
}

function withinVisibilityGrace(entry: ActiveDownloadRequest, now: number) {
  const submittedAt = entry.request.submittedAt ?? entry.request.createdAt;
  if (!submittedAt) {
    return false;
  }
  const submittedMs = submittedAt instanceof Date ? submittedAt.getTime() : Number(submittedAt);
  return now - submittedMs < MIN_SAB_VISIBILITY_WINDOW_MS;
}

export async function retryMissingSabnzbdQueueItems(
  userId: string,
  client: ResolvedImportSabnzbdClient,
  snapshot: SabnzbdQueueSnapshot,
  history: SabnzbdHistorySnapshot,
): Promise<MissingQueueItemRetryResult> {
  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.client.id);
  const currentQueueIds = new Set(snapshot.items.map((item) => item.id));
  const historyQueueIds = new Set(history.items.map((item) => item.id));
  const retriedItemKeys = new Set<string>();
  const now = Date.now();
  let missingCount = 0;
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  let graceCount = 0;
  let awaitingImportCount = 0;

  for (const entry of activeRequests) {
    if (!isTrackedActiveDownload(entry)) {
      continue;
    }

    if (currentQueueIds.has(entry.queueItem.externalQueueId)) {
      // Item is back / still visible — clear any prior missing-tick streak.
      if ((entry.request.missingTickCount ?? 0) > 0) {
        await resetDownloadRequestMissingTickCount({ userId, requestId: entry.request.id });
      }
      continue;
    }

    if (historyQueueIds.has(entry.queueItem.externalQueueId)) {
      // SAB has moved this item to history (completed/failed/aborted). The import-completed
      // workflow owns transitioning the request out of the active set; do NOT retry here.
      awaitingImportCount += 1;
      if ((entry.request.missingTickCount ?? 0) > 0) {
        await resetDownloadRequestMissingTickCount({ userId, requestId: entry.request.id });
      }
      continue;
    }

    if (withinVisibilityGrace(entry, now)) {
      graceCount += 1;
      continue;
    }

    const nextMissingTickCount = (entry.request.missingTickCount ?? 0) + 1;
    await incrementDownloadRequestMissingTickCount({ userId, requestId: entry.request.id });

    if (nextMissingTickCount < MISSING_TICKS_THRESHOLD) {
      // Soft mark as requeuing; do not declare failure yet.
      if (entry.request.status !== "requeuing") {
        await updateDownloadRequestStatus({
          userId,
          requestId: entry.request.id,
          status: "requeuing",
          externalJobId: entry.queueItem.externalQueueId,
          statusMessage: `SABnzbd has not reported this job for ${nextMissingTickCount} consecutive checks.`,
        });
      }
      continue;
    }

    missingCount += 1;

    const retryCount = entry.request.retryCount ?? 0;
    const retriesExhausted = retryCount >= MAX_MISSING_RETRY_COUNT;

    await updateDownloadQueueItemStatus({
      userId,
      queueItemId: entry.queueItem.id,
      status: "failed",
      completedAt: new Date(),
    });
    await updateDownloadRequestStatus({
      userId,
      requestId: entry.request.id,
      status: "failed",
      externalJobId: entry.queueItem.externalQueueId,
      statusMessage: retriesExhausted ? exhaustedRetriesMessage : missingQueueMessage,
      completedAt: new Date(),
    });

    if (retriesExhausted) {
      continue;
    }

    const mediaTitleId = entry.request.mediaTitleId;
    const itemKey = retryKey(mediaTitleId, entry.request.episodeId);

    if (!mediaTitleId || !itemKey || retriedItemKeys.has(itemKey)) {
      continue;
    }

    retriedItemKeys.add(itemKey);
    attemptedCount += 1;
    await incrementDownloadRequestRetryCount({ userId, requestId: entry.request.id });

    try {
      const exclusions = await listDownloadRequestReleaseExclusionsForItem({
        userId,
        mediaTitleId,
        episodeId: entry.request.episodeId,
        seasonId: entry.request.seasonId,
      });
      const retry = await searchLibraryItemReleasesWorkflow(userId, {
        titleId: mediaTitleId,
        episodeId: entry.request.episodeId ?? undefined,
        targetLibraryPathId: entry.request.targetLibraryPathId ?? undefined,
        excludedResultIds: exclusions.resultIds,
        excludedReleaseKeys: exclusions.releaseKeys,
      });

      if (retry.queuedDownload.queued) {
        queuedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  return { missingCount, attemptedCount, queuedCount, failedCount, graceCount, awaitingImportCount };
}