import {
  countDownloadRequestHistory,
  listDownloadRequestHistoryPage,
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
  retryAction: "find_alternative_release" | "retry_import" | null;
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

type DownloadActivityRow = Awaited<ReturnType<typeof listRecentDownloadRequestsWithQueueItems>>[number];

function mapDownloadActivityRows(rows: DownloadActivityRow[]) {
  const entries = new Map<string, DownloadActivityEntry>();

  for (const row of rows) {
    if (entries.has(row.request.id)) continue;
    entries.set(row.request.id, {
      id: row.request.id,
      mediaType: row.request.mediaType,
      requestedTitle: row.request.requestedTitle,
      releaseTitle: row.request.releaseTitle,
      status: row.request.status,
      statusMessage: row.request.statusMessage,
      retryCount: row.request.retryCount,
      canRetry: retryableStatuses.includes(row.request.status) && row.request.mediaTitleId !== null,
      retryAction: retryableStatuses.includes(row.request.status) && row.request.mediaTitleId !== null
        ? row.queueItem?.status === "completed"
          ? "retry_import"
          : "find_alternative_release"
        : null,
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

export async function listDownloadActivity(userId: string): Promise<DownloadActivityEntry[]> {
  const rows = await listRecentDownloadRequestsWithQueueItems(userId, downloadActivityLimit);
  return mapDownloadActivityRows(rows);
}

export const downloadActivityViews = {
  active: ["pending", "queued", "downloading", "importing", "requeuing"],
  attention: ["failed", "cancelled"],
  completed: ["succeeded"],
} as const satisfies Record<string, readonly DownloadRequestStatus[]>;

export type DownloadActivityView = keyof typeof downloadActivityViews;

export async function getDownloadActivityPage(input: {
  userId: string;
  view: DownloadActivityView;
  query?: string;
  page?: number;
  pageSize?: number;
}) {
  const query = input.query?.trim().slice(0, 120) || undefined;
  const pageSize = Math.max(1, Math.min(50, Math.floor(input.pageSize ?? 25)));
  const requestedPage = Math.max(1, Math.floor(input.page ?? 1));
  const statuses = [...downloadActivityViews[input.view]];
  const total = await countDownloadRequestHistory({ userId: input.userId, statuses, query });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);
  const result = await listDownloadRequestHistoryPage({
    userId: input.userId,
    statuses,
    query,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  const [active, attention, completed] = await Promise.all((Object.keys(downloadActivityViews) as DownloadActivityView[]).map((view) => (
    countDownloadRequestHistory({
      userId: input.userId,
      statuses: [...downloadActivityViews[view]],
      query,
    })
  )));

  return {
    entries: mapDownloadActivityRows(result.rows as DownloadActivityRow[]),
    counts: { active, attention, completed },
    pagination: {
      page,
      pageCount,
      total,
      hasPreviousPage: page > 1,
      hasNextPage: page < pageCount,
    },
    query: query ?? "",
  };
}
