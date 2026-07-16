import {
  type DownloadActivityRepositoryRow,
  countDownloadRequestHistory,
  listDownloadRequestHistoryPage,
  listRecentDownloadRequestsWithQueueItems,
} from "@/modules/downloads/repositories/download-repository";
import {
  listDownloadFulfillmentEpisodesForIds,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  type DownloadFulfillmentEpisodeStatus,
  type DownloadFulfillmentStatus,
  type DownloadQueueItemStatus,
  type DownloadRequestStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export const downloadActivityLimit = 50;

export type DownloadActivityStatus = DownloadRequestStatus | "recovering" | "cancelling";

export type SeasonEpisodeProgress = Record<DownloadFulfillmentEpisodeStatus, number> & {
  total: number;
};

export type DownloadActivityEntry = {
  id: string;
  requestId: string | null;
  fulfillmentId: string | null;
  mediaType: RecommendationMediaType;
  requestedTitle: string;
  releaseTitle: string | null;
  status: DownloadActivityStatus;
  statusMessage: string | null;
  technicalStatusMessage: string | null;
  planMessage: string | null;
  nextAttemptAt: Date | null;
  cancellationPending: boolean;
  seasonEpisodeProgress: SeasonEpisodeProgress | null;
  attemptCount: number;
  failedAttemptCount: number;
  isRecovering: boolean;
  retryCount: number;
  canRetry: boolean;
  retryAction: "find_alternative_release" | "retry_import" | "resume_season_recovery" | null;
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
const activeRequestStatuses: DownloadRequestStatus[] = [
  "pending",
  "queued",
  "downloading",
  "importing",
  "requeuing",
];
const openFulfillmentStatuses: DownloadFulfillmentStatus[] = ["active", "retry_wait", "partial"];

type DownloadActivityRow = DownloadActivityRepositoryRow;

function planMessage(fulfillment: NonNullable<DownloadActivityRow["fulfillment"]>) {
  const packAttempts = fulfillment.packAttemptCount;
  const attemptLabel = `${packAttempts} season pack attempt${packAttempts === 1 ? "" : "s"}`;
  const needsAttention = ["blocked", "failed", "cancelled"].includes(fulfillment.status);

  if (needsAttention && fulfillment.strategy === "episodes") {
    return packAttempts > 0
      ? `Season recovery paused after ${attemptLabel}. Resume it to re-check every missing episode.`
      : "Season recovery paused. Resume it to re-check every missing episode.";
  }

  if (needsAttention) {
    return `Season-pack recovery paused after ${packAttempts} of ${fulfillment.packAttemptLimit} attempts. Resume it to continue the whole season plan.`;
  }

  if (fulfillment.strategy === "episodes") {
    return packAttempts > 0
      ? `Season plan switched to individual episodes after ${attemptLabel}.`
      : "Season plan is checking each missing episode individually.";
  }

  if (openFulfillmentStatuses.includes(fulfillment.status)) {
    return `Season plan is trying season packs automatically (${packAttempts} of ${fulfillment.packAttemptLimit} attempts used).`;
  }

  return packAttempts > 0
    ? `Season plan finished after ${attemptLabel}.`
    : "Season plan finished before a season pack was queued.";
}

function requestPriority(status: DownloadRequestStatus) {
  switch (status) {
    case "downloading": return 7;
    case "importing": return 6;
    case "queued": return 5;
    case "requeuing": return 4;
    case "pending": return 3;
    case "failed": return 2;
    case "cancelled": return 2;
    default: return 1;
  }
}

function queueStatusPriority(status: DownloadQueueItemStatus) {
  switch (status) {
    case "downloading": return 5;
    case "queued": return 4;
    case "paused": return 3;
    case "failed": return 2;
    case "completed": return 1;
  }
}

function aggregateQueueItems(items: NonNullable<DownloadActivityRow["queueItem"]>[]) {
  if (items.length === 0) return null;
  const unique = [...new Map(items.map((item, index) => [item.id ?? `queue-${index}`, item])).values()];
  const status = [...unique].sort((left, right) => (
    queueStatusPriority(right.status) - queueStatusPriority(left.status)
    || right.updatedAt.getTime() - left.updatedAt.getTime()
    || left.id.localeCompare(right.id)
  ))[0]!.status;
  const progressPercent = unique.reduce((sum, item) => sum + item.progressPercent, 0) / unique.length;
  const sizes = unique.flatMap((item) => item.sizeBytes === null ? [] : [item.sizeBytes]);
  const etas = unique.flatMap((item) => item.etaSeconds === null ? [] : [item.etaSeconds]);

  return {
    status,
    progressPercent,
    sizeBytes: sizes.length > 0 ? Math.max(...sizes) : null,
    etaSeconds: etas.length > 0 ? Math.max(...etas) : null,
  };
}

function mapDownloadActivityRows(rows: DownloadActivityRow[]) {
  const groups = new Map<string, DownloadActivityRow[]>();

  for (const row of rows) {
    const key = row.fulfillment?.id ?? row.request?.id;
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }

  return [...groups.entries()].map(([logicalId, group]) => {
    const fulfillment = group.find((row) => row.fulfillment)?.fulfillment ?? null;
    const attemptsById = new Map<string, {
      request: NonNullable<DownloadActivityRow["request"]>;
      queueItems: NonNullable<DownloadActivityRow["queueItem"]>[];
    }>();
    for (const row of group) {
      if (!row.request) continue;
      const attempt = attemptsById.get(row.request.id) ?? { request: row.request, queueItems: [] };
      if (row.queueItem && !attempt.queueItems.some((item) => item.id === row.queueItem!.id)) {
        attempt.queueItems.push(row.queueItem);
      }
      attemptsById.set(row.request.id, attempt);
    }
    const attempts = [...attemptsById.values()];
    const representative = [...attempts].sort((left, right) => (
      requestPriority(right.request.status) - requestPriority(left.request.status)
      || right.request.createdAt.getTime() - left.request.createdAt.getTime()
      || left.request.id.localeCompare(right.request.id)
    ))[0] ?? null;
    const fulfillmentIsOpen = fulfillment
      ? openFulfillmentStatuses.includes(fulfillment.status)
      : false;
    const failedAttemptCount = attempts.filter(({ request }) => (
      request.status === "failed" || request.status === "cancelled"
    )).length;
    const fulfillmentCancellationPending = Boolean(fulfillment?.cancellationRequestedAt);
    const requestCancellationPending = !fulfillment
      && !!representative
      && activeRequestStatuses.includes(representative.request.status)
      && Boolean(representative.request.cancellationRequestedAt);
    const cancellationPending = fulfillmentCancellationPending || requestCancellationPending;
    const isRecovering = fulfillmentIsOpen && !cancellationPending && (
      failedAttemptCount > 0
      || fulfillment?.strategy === "episodes"
      || fulfillment?.status === "retry_wait"
      || fulfillment?.status === "partial"
      || !representative
      || !activeRequestStatuses.includes(representative.request.status)
    );
    const status: DownloadActivityStatus = cancellationPending
      ? "cancelling"
      : fulfillment?.status === "succeeded"
        ? "succeeded"
        : fulfillment?.status === "cancelled"
        ? "cancelled"
        : fulfillment?.status === "blocked" || fulfillment?.status === "failed"
          ? "failed"
          : isRecovering
            ? "recovering"
            : representative?.request.status ?? "recovering";
    const fulfillmentNeedsAttention = fulfillment
      ? ["blocked", "failed", "cancelled"].includes(fulfillment.status)
      : false;
    const canRetry = fulfillmentCancellationPending || fulfillmentNeedsAttention || (
      !fulfillment
      && !requestCancellationPending
      && (status === "failed" || status === "cancelled")
      && !!representative
      && retryableStatuses.includes(representative.request.status)
      && representative.request.mediaTitleId !== null
    );
    const retryAction: DownloadActivityEntry["retryAction"] = canRetry
      ? fulfillmentCancellationPending || fulfillmentNeedsAttention
        ? "resume_season_recovery"
        : representative?.queueItems.some((item) => item.status === "completed")
          ? "retry_import"
          : "find_alternative_release"
      : null;
    const activeAttempts = attempts.filter(({ request }) => activeRequestStatuses.includes(request.status));
    const queueItems = (activeAttempts.length > 0 ? activeAttempts : representative ? [representative] : [])
      .flatMap((attempt) => attempt.queueItems);
    const queue = aggregateQueueItems(queueItems);

    return {
      id: logicalId,
      requestId: representative?.request.id ?? null,
      fulfillmentId: fulfillment?.id ?? null,
      mediaType: fulfillment ? "tv" : representative!.request.mediaType,
      requestedTitle: fulfillment?.requestedTitle ?? representative!.request.requestedTitle,
      releaseTitle: representative?.request.releaseTitle ?? null,
      status,
      statusMessage: fulfillment?.statusMessage ?? representative?.request.statusMessage ?? null,
      technicalStatusMessage: representative?.request.statusMessage ?? fulfillment?.statusMessage ?? null,
      planMessage: fulfillment ? planMessage(fulfillment) : null,
      nextAttemptAt: fulfillment?.nextAttemptAt ?? null,
      cancellationPending,
      seasonEpisodeProgress: null,
      attemptCount: attempts.length,
      failedAttemptCount,
      isRecovering,
      retryCount: Math.max(0, ...attempts.map(({ request }) => request.retryCount)),
      canRetry,
      retryAction,
      createdAt: fulfillment?.createdAt ?? representative!.request.createdAt,
      completedAt: fulfillment
        ? fulfillment.completedAt
        : representative!.request.completedAt,
      queue,
    };
  });
}

async function addSeasonEpisodeProgress(
  userId: string,
  entries: DownloadActivityEntry[],
) {
  const fulfillmentIds = entries.flatMap((entry) => (
    entry.fulfillmentId ? [entry.fulfillmentId] : []
  ));
  if (fulfillmentIds.length === 0) return entries;

  const states = await listDownloadFulfillmentEpisodesForIds({
    userId,
    fulfillmentIds,
  });
  const byFulfillment = new Map<string, SeasonEpisodeProgress>();
  for (const state of states) {
    const progress = byFulfillment.get(state.fulfillmentId) ?? {
      total: 0,
      pending: 0,
      active: 0,
      retry_wait: 0,
      succeeded: 0,
      unavailable: 0,
      blocked: 0,
      deferred: 0,
    };
    progress.total += 1;
    progress[state.status] += 1;
    byFulfillment.set(state.fulfillmentId, progress);
  }

  return entries.map((entry) => ({
    ...entry,
    seasonEpisodeProgress: entry.fulfillmentId
      ? byFulfillment.get(entry.fulfillmentId) ?? null
      : null,
  }));
}

export async function listDownloadActivity(userId: string): Promise<DownloadActivityEntry[]> {
  const rows = await listRecentDownloadRequestsWithQueueItems(userId, downloadActivityLimit);
  return addSeasonEpisodeProgress(userId, mapDownloadActivityRows(rows));
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

  const entries = await addSeasonEpisodeProgress(
    input.userId,
    mapDownloadActivityRows(result.rows as DownloadActivityRow[]),
  );

  return {
    entries,
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
