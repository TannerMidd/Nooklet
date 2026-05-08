import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import {
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
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
};

const missingQueueMessage = "SABnzbd queue item is no longer present. It may have been removed manually.";

function retryKey(mediaTitleId: string | null, episodeId: string | null) {
  if (!mediaTitleId) {
    return null;
  }

  return `${mediaTitleId}:${episodeId ?? "movie"}`;
}

function isTrackedActiveDownload(entry: ActiveDownloadRequest) {
  return ["queued", "downloading"].includes(entry.request.status)
    && ["queued", "downloading"].includes(entry.queueItem.status);
}

export async function retryMissingSabnzbdQueueItems(
  userId: string,
  client: ResolvedImportSabnzbdClient,
  snapshot: SabnzbdQueueSnapshot,
): Promise<MissingQueueItemRetryResult> {
  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.client.id);
  const currentQueueIds = new Set(snapshot.items.map((item) => item.id));
  const retriedItemKeys = new Set<string>();
  let missingCount = 0;
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;

  for (const entry of activeRequests) {
    if (!isTrackedActiveDownload(entry) || currentQueueIds.has(entry.queueItem.externalQueueId)) {
      continue;
    }

    missingCount += 1;

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
      statusMessage: missingQueueMessage,
      completedAt: new Date(),
    });

    const mediaTitleId = entry.request.mediaTitleId;
    const itemKey = retryKey(mediaTitleId, entry.request.episodeId);

    if (!mediaTitleId || !itemKey || retriedItemKeys.has(itemKey)) {
      continue;
    }

    retriedItemKeys.add(itemKey);
    attemptedCount += 1;

    try {
      const exclusions = await listDownloadRequestReleaseExclusionsForItem({
        userId,
        mediaTitleId,
        episodeId: entry.request.episodeId,
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

  return { missingCount, attemptedCount, queuedCount, failedCount };
}