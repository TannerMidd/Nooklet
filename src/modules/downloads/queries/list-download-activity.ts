import {
  listRecentDownloadRequestsWithQueueItems,
} from "@/modules/downloads/repositories/download-repository";
import {
  type DownloadQueueItemStatus,
  type DownloadRequestStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export const downloadActivityLimit = 50;

export type DownloadActivityEntry = {
  id: string;
  mediaType: RecommendationMediaType;
  requestedTitle: string;
  releaseTitle: string | null;
  status: DownloadRequestStatus;
  statusMessage: string | null;
  retryCount: number;
  canRetry: boolean;
  createdAt: Date;
  completedAt: Date | null;
  queue: {
    status: DownloadQueueItemStatus;
    progressPercent: number;
    sizeBytes: number | null;
    etaSeconds: number | null;
  } | null;
};

const retryableStatuses: DownloadRequestStatus[] = ["failed", "cancelled"];

export async function listDownloadActivity(userId: string): Promise<DownloadActivityEntry[]> {
  const rows = await listRecentDownloadRequestsWithQueueItems(userId, downloadActivityLimit);
  const entries = new Map<string, DownloadActivityEntry>();

  for (const row of rows) {
    if (entries.has(row.request.id)) {
      continue;
    }

    entries.set(row.request.id, {
      id: row.request.id,
      mediaType: row.request.mediaType,
      requestedTitle: row.request.requestedTitle,
      releaseTitle: row.request.releaseTitle,
      status: row.request.status,
      statusMessage: row.request.statusMessage,
      retryCount: row.request.retryCount,
      canRetry: retryableStatuses.includes(row.request.status) && row.request.mediaTitleId !== null,
      createdAt: row.request.createdAt,
      completedAt: row.request.completedAt,
      queue: row.queueItem
        ? {
            status: row.queueItem.status,
            progressPercent: row.queueItem.progressPercent,
            sizeBytes: row.queueItem.sizeBytes,
            etaSeconds: row.queueItem.etaSeconds,
          }
        : null,
    });
  }

  return [...entries.values()];
}
