import {
  type SabnzbdHistorySnapshot,
  type SabnzbdQueueSnapshot,
} from "@/lib/integrations/sabnzbd";
import {
  findDownloadRequestById,
  incrementDownloadRequestMissingTickCount,
  incrementDownloadRequestRetryCount,
  listActiveDownloadRequestsForImport,
  listDownloadRequestReleaseExclusionsForItem,
  resetDownloadRequestMissingTickCount,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import {
  attachDownloadRequestToFulfillment,
  findDownloadFulfillmentById,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  attemptSeasonPack,
  createSeasonFulfillment,
  markFulfillmentEpisodeFailedAndRetry,
} from "@/modules/downloads/workflows/season-fulfillment";
import { findTvEpisodeByIdForUser } from "@/modules/media-library/repositories/media-library-repository";

import { buildDownloadRequestReleaseSearchInput } from "../download-request-release-search-input";
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

function retryKey(
  mediaTitleId: string | null,
  episodeId: string | null,
  seasonId: string | null,
) {
  if (!mediaTitleId) {
    return null;
  }

  return `${mediaTitleId}:${episodeId ?? seasonId ?? "title"}`;
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
  const fulfillmentById = new Map<string, Awaited<ReturnType<typeof findDownloadFulfillmentById>>>();
  const terminalFailures = new Map<string, {
    title: string;
    mediaType: "tv" | "movie";
    message: string;
  }>();
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

    const requestWorkLease = entry.request.fulfillmentId
      ? null
      : await acquireDownloadRequestWorkLease(userId, entry.request.id);
    if (!entry.request.fulfillmentId && !requestWorkLease) {
      continue;
    }

    try {
    if (requestWorkLease) {
      const currentRequest = await findDownloadRequestById(userId, entry.request.id);
      if (
        !currentRequest
        || currentRequest.cancellationRequestedAt
        || (currentRequest.fulfillmentId ?? null) !== (entry.request.fulfillmentId ?? null)
        || !isTrackedActiveDownload({ ...entry, request: currentRequest })
      ) {
        continue;
      }
    }

    if (entry.request.fulfillmentId) {
      let fulfillment = fulfillmentById.get(entry.request.fulfillmentId);
      if (fulfillment === undefined) {
        fulfillment = await findDownloadFulfillmentById(
          userId,
          entry.request.fulfillmentId,
        );
        fulfillmentById.set(entry.request.fulfillmentId, fulfillment);
      }
      if (fulfillment?.cancellationRequestedAt) {
        // The cancellation reconciler owns this queue id. Missing-item
        // recovery must not turn deliberate removal into a fresh download.
        continue;
      }
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

    // Season fulfillments have their own durable attempt budget. A vanished
    // pack advances to another pack and then episode fallback; a vanished
    // episode child retries independently without producing a false terminal
    // season notification.
    if (
      entry.request.mediaTitleId
      && entry.request.seasonId
      && (!entry.request.episodeId || entry.request.fulfillmentId)
    ) {
      const fulfillmentKey = retryKey(
        entry.request.mediaTitleId,
        entry.request.episodeId,
        entry.request.seasonId,
      )!;
      if (retriedItemKeys.has(fulfillmentKey)) continue;
      retriedItemKeys.add(fulfillmentKey);
      attemptedCount += 1;
      await incrementDownloadRequestRetryCount({ userId, requestId: entry.request.id });

      try {
        if (entry.request.episodeId && entry.request.fulfillmentId) {
          const episode = await findTvEpisodeByIdForUser(userId, entry.request.episodeId);
          const queued = episode
            ? await markFulfillmentEpisodeFailedAndRetry({
                userId,
                fulfillmentId: entry.request.fulfillmentId,
                episode: episode.episode,
                failureMessage: missingQueueMessage,
              })
            : false;
          if (queued) queuedCount += 1;
          else failedCount += 1;
          continue;
        }

        const existing = entry.request.fulfillmentId
          ? await findDownloadFulfillmentById(userId, entry.request.fulfillmentId)
          : null;
        const fulfillment = existing ?? await createSeasonFulfillment({
          userId,
          mediaTitleId: entry.request.mediaTitleId,
          seasonId: entry.request.seasonId,
          requestedTitle: entry.request.requestedTitle,
          targetLibraryPathId: entry.request.targetLibraryPathId,
        });
        if (!entry.request.fulfillmentId) {
          await attachDownloadRequestToFulfillment({
            userId,
            fulfillmentId: fulfillment.id,
            requestId: entry.request.id,
            attemptStrategy: "season_pack",
            attemptNumber: Math.max(1, fulfillment.packAttemptCount + 1),
          });
        }
        const recovery = await attemptSeasonPack(userId, fulfillment.id);
        const replacementQueued = recovery.releaseSearch?.queuedDownload.queued === true;
        const fallbackQueued = recovery.fallback?.queuedCount ?? 0;
        if (replacementQueued) queuedCount += 1;
        else if (fallbackQueued > 0 || (recovery.fallback?.activeCount ?? 0) > 0) {
          queuedCount += fallbackQueued;
        } else {
          failedCount += 1;
          if (recovery.fulfillment.status === "blocked" || recovery.fulfillment.status === "failed") {
            terminalFailures.set(fulfillmentKey, {
              title: entry.request.requestedTitle,
              mediaType: entry.request.mediaType,
              message: recovery.fulfillment.statusMessage ?? missingQueueMessage,
            });
          }
        }
      } catch {
        failedCount += 1;
      }
      continue;
    }

    if (retriesExhausted) {
      terminalFailures.set(
        retryKey(entry.request.mediaTitleId, entry.request.episodeId, entry.request.seasonId)
          ?? `request:${entry.request.id}`,
        {
          title: entry.request.requestedTitle,
          mediaType: entry.request.mediaType,
          message: exhaustedRetriesMessage,
        },
      );
      continue;
    }

    const mediaTitleId = entry.request.mediaTitleId;
    const itemKey = retryKey(mediaTitleId, entry.request.episodeId, entry.request.seasonId);

    if (!mediaTitleId || !itemKey) {
      terminalFailures.set(`request:${entry.request.id}`, {
        title: entry.request.requestedTitle,
        mediaType: entry.request.mediaType,
        message: missingQueueMessage,
      });
      continue;
    }

    if (retriedItemKeys.has(itemKey)) {
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
      const retry = await searchLibraryItemReleasesWorkflow(
        userId,
        buildDownloadRequestReleaseSearchInput(
          { ...entry.request, mediaTitleId },
          exclusions,
        ),
      );

      if (retry.queuedDownload.queued) {
        queuedCount += 1;
      } else {
        failedCount += 1;
        terminalFailures.set(itemKey, {
          title: entry.request.requestedTitle,
          mediaType: entry.request.mediaType,
          message: missingQueueMessage,
        });
      }
    } catch {
      failedCount += 1;
      terminalFailures.set(itemKey, {
        title: entry.request.requestedTitle,
        mediaType: entry.request.mediaType,
        message: missingQueueMessage,
      });
    }
    } finally {
      if (requestWorkLease) {
        await releaseDownloadRequestWorkLease(requestWorkLease);
      }
    }
  }

  for (const failure of terminalFailures.values()) {
    await safeDispatchNotificationWorkflow({
      userId,
      payload: {
        eventType: "download_failed",
        title: failure.title,
        mediaType: failure.mediaType,
        message: failure.message,
      },
    });
  }

  return { missingCount, attemptedCount, queuedCount, failedCount, graceCount, awaitingImportCount };
}
