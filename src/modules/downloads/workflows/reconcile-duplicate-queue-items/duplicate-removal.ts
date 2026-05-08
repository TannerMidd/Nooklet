import { removeSabnzbdQueueItem, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import {
  listActiveDownloadRequestsForImport,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedImportSabnzbdClient } from "../import-completed-downloads/client-resolution";

type ActiveDownloadRequest = Awaited<ReturnType<typeof listActiveDownloadRequestsForImport>>[number];

export type DuplicateQueueItemReconciliationResult = {
  duplicateGroupCount: number;
  keptCount: number;
  removedCount: number;
  failedCount: number;
};

const duplicateQueueMessage = "Duplicate active SABnzbd queue item removed by Nooklet.";

function itemKey(entry: ActiveDownloadRequest) {
  if (!entry.request.mediaTitleId) {
    return null;
  }

  return `${entry.request.mediaTitleId}:${entry.request.episodeId ?? "movie"}`;
}

function isTrackedActiveDownload(entry: ActiveDownloadRequest) {
  return ["queued", "downloading"].includes(entry.request.status)
    && ["queued", "downloading"].includes(entry.queueItem.status)
    && Boolean(entry.request.mediaTitleId);
}

function entryCreatedAt(entry: ActiveDownloadRequest) {
  return entry.queueItem.createdAt.getTime();
}

function entryProgress(entry: ActiveDownloadRequest, snapshot: SabnzbdQueueSnapshot) {
  const queueItem = snapshot.items.find((item) => item.id === entry.queueItem.externalQueueId);

  return queueItem?.progressPercent ?? entry.queueItem.progressPercent;
}

function selectEntryToKeep(entries: ActiveDownloadRequest[], snapshot: SabnzbdQueueSnapshot) {
  return [...entries].sort((left, right) => {
    const progress = entryProgress(right, snapshot) - entryProgress(left, snapshot);

    if (progress !== 0) {
      return progress;
    }

    return entryCreatedAt(left) - entryCreatedAt(right);
  })[0];
}

export async function removeDuplicateSabnzbdQueueItems(
  userId: string,
  client: ResolvedImportSabnzbdClient,
  snapshot: SabnzbdQueueSnapshot,
): Promise<DuplicateQueueItemReconciliationResult> {
  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.client.id);
  const currentQueueIds = new Set(snapshot.items.map((item) => item.id));
  const activeRequestsByItem = new Map<string, ActiveDownloadRequest[]>();
  let duplicateGroupCount = 0;
  let keptCount = 0;
  let removedCount = 0;
  let failedCount = 0;

  for (const entry of activeRequests) {
    if (!isTrackedActiveDownload(entry) || !currentQueueIds.has(entry.queueItem.externalQueueId)) {
      continue;
    }

    const key = itemKey(entry);

    if (!key) {
      continue;
    }

    activeRequestsByItem.set(key, [...(activeRequestsByItem.get(key) ?? []), entry]);
  }

  for (const entries of activeRequestsByItem.values()) {
    if (entries.length <= 1) {
      continue;
    }

    const keptEntry = selectEntryToKeep(entries, snapshot);

    if (!keptEntry) {
      continue;
    }

    duplicateGroupCount += 1;
    keptCount += 1;

    for (const entry of entries) {
      if (entry.queueItem.id === keptEntry.queueItem.id) {
        continue;
      }

      try {
        await removeSabnzbdQueueItem({
          baseUrl: client.baseUrl,
          apiKey: client.apiKey,
          itemId: entry.queueItem.externalQueueId,
        });
        await updateDownloadQueueItemStatus({
          userId,
          queueItemId: entry.queueItem.id,
          status: "failed",
          completedAt: new Date(),
        });
        await updateDownloadRequestStatus({
          userId,
          requestId: entry.request.id,
          status: "cancelled",
          externalJobId: entry.queueItem.externalQueueId,
          statusMessage: duplicateQueueMessage,
          completedAt: new Date(),
        });
        removedCount += 1;
      } catch {
        failedCount += 1;
      }
    }
  }

  return { duplicateGroupCount, keptCount, removedCount, failedCount };
}