import {
  countBudgetConsumingReleaseAttemptsForItem,
  listDownloadRequestReleaseExclusionsForItem,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  findDownloadFulfillmentById,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { buildDownloadRequestReleaseSearchInput } from "@/modules/downloads/workflows/download-request-release-search-input";
import { isInfrastructureDownloadFailure } from "@/modules/downloads/workflows/download-failure-classification";
import {
  markFulfillmentEpisodeFailedAndRetry,
  markFulfillmentEpisodeSucceeded,
  markSeasonPackFailedAndRecover,
  reconcileSeasonCoverage,
} from "@/modules/downloads/workflows/season-fulfillment";
import { ensureSeasonFulfillmentForRequest } from "@/modules/downloads/workflows/season-fulfillment-adoption";
import { findTvEpisodeByIdForUser } from "@/modules/media-library/repositories/media-library-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { isRetryableCompletedMediaFailure } from "./file-inspection";
import { type OrganizedCompletedDownload } from "./file-organization";
import { type MatchedCompletedDownload } from "./request-matching";

export type CompletedDownloadRetryResult = {
  attemptedCount: number;
  queuedCount: number;
  failedCount: number;
};

/**
 * Maximum budget-consuming alternatives before a bounded/cooldown recovery
 * path. Zero-transfer failures are free (see attempt-cost.ts), so dead posts
 * cycle through candidates without exhausting this budget.
 */
export const maxAutoRetriesPerItem = 3;

function retryableFailureMatch(download: OrganizedCompletedDownload): MatchedCompletedDownload | null {
  if (download.kind !== "failed") return null;
  const inspected = download.source;
  if (inspected.kind === "ready") {
    return isRetryableCompletedMediaFailure(download.message)
      ? inspected.source.match
      : null;
  }
  if (inspected.source.kind === "failed") {
    if (
      inspected.source.match.historyItem.statusKind !== "failed"
      || isInfrastructureDownloadFailure(
        inspected.source.match.historyItem.failMessage,
        inspected.source.match.historyItem.failureKind,
      )
    ) {
      return null;
    }
    return inspected.source.match;
  }
  return isRetryableCompletedMediaFailure(download.message) ? inspected.source.match : null;
}

function matchItemKey(match: MatchedCompletedDownload) {
  if (!match.request.mediaTitleId) return null;
  return `${match.request.mediaTitleId}:${match.request.episodeId ?? match.request.seasonId ?? "title"}`;
}

function importedItemKeys(downloads: OrganizedCompletedDownload[]) {
  return new Set(downloads.flatMap((download) => {
    if (download.kind !== "organized") return [];
    const key = matchItemKey(download.source.source.match);
    return key ? [key] : [];
  }));
}

export async function retryFailedCompletedDownloads(
  userId: string,
  downloads: OrganizedCompletedDownload[],
): Promise<CompletedDownloadRetryResult> {
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  const retriedItemKeys = new Set<string>();
  const successfulItemKeys = importedItemKeys(downloads);

  // Successful pack imports still need a coverage check. This detects a
  // partial pack and queues only the missing aired episodes.
  const reconciledFulfillmentIds = new Set<string>();
  for (const download of downloads) {
    if (download.kind !== "organized") continue;
    const match = download.source.source.match;
    const fulfillment = await ensureSeasonFulfillmentForRequest(userId, match.request);
    if (!fulfillment || reconciledFulfillmentIds.has(fulfillment.id)) continue;
    reconciledFulfillmentIds.add(fulfillment.id);

    if (match.request.episodeId) {
      await markFulfillmentEpisodeSucceeded({
        userId,
        fulfillmentId: fulfillment.id,
        episodeId: match.request.episodeId,
      });
    }

    const coverage = await reconcileSeasonCoverage({
      userId,
      fulfillmentId: fulfillment.id,
      reason: match.request.episodeId
        ? "An episode imported successfully; checking the rest of the season."
        : "The season pack imported; checking for any missing episodes.",
    });
    if (coverage && coverage.queuedCount > 0) {
      attemptedCount += 1;
      queuedCount += coverage.queuedCount;
    }
  }

  for (const download of downloads) {
    const match = retryableFailureMatch(download);
    if (!match) continue;
    const mediaTitleId = match.request.mediaTitleId;
    const itemKey = matchItemKey(match);
    if (!mediaTitleId || !itemKey || retriedItemKeys.has(itemKey) || successfulItemKeys.has(itemKey)) {
      continue;
    }
    retriedItemKeys.add(itemKey);

    try {
      const failureMessage = match.historyItem.failMessage
        ?? (download.kind === "failed" ? download.message : null)
        ?? "The download failed.";
      // Zero-transfer failures (dead posts the engine abandoned before any
      // download) are budget-free: the release stays excluded, but the
      // attempt does not count against the bounded auto-retry budget.
      const attemptWasFree = match.historyItem.statusKind === "failed"
        && match.historyItem.downloadedBytes === 0;
      const fulfillment = await ensureSeasonFulfillmentForRequest(userId, match.request);

      if (fulfillment && match.request.episodeId) {
        const episode = await findTvEpisodeByIdForUser(userId, match.request.episodeId);
        if (!episode) {
          failedCount += 1;
          continue;
        }
        attemptedCount += 1;
        const queued = await markFulfillmentEpisodeFailedAndRetry({
          userId,
          fulfillmentId: fulfillment.id,
          episode: episode.episode,
          failureMessage,
          attemptWasFree,
        });
        await updateDownloadRequestStatus({
          userId,
          requestId: match.request.id,
          status: "failed",
          statusMessage: queued
            ? `${failureMessage} Nooklet queued a different episode release automatically.`
            : `${failureMessage} Immediate alternatives are exhausted; Nooklet will search for this episode again later.`,
        });
        if (queued) queuedCount += 1;
        else failedCount += 1;
        continue;
      }

      if (fulfillment && !match.request.episodeId) {
        attemptedCount += 1;
        const recovery = await markSeasonPackFailedAndRecover({
          userId,
          fulfillmentId: fulfillment.id,
          failureMessage,
        });
        const updated = await findDownloadFulfillmentById(userId, fulfillment.id);
        // A failed pack now switches straight to episode coverage, so the only
        // recovery signal left is how many episodes that queued.
        const fallbackQueued = recovery?.fallback?.queuedCount ?? 0;
        await updateDownloadRequestStatus({
          userId,
          requestId: match.request.id,
          status: "failed",
          statusMessage: `${failureMessage} ${updated?.statusMessage ?? "Nooklet checked automatic recovery options."}`,
        });
        if (fallbackQueued > 0) queuedCount += fallbackQueued;
        else failedCount += 1;
        continue;
      }

      // Movies and explicitly requested standalone episodes retain the
      // bounded legacy alternative search, now with a valid episode-only scope.
      const exclusions = await listDownloadRequestReleaseExclusionsForItem({
        userId,
        mediaTitleId,
        episodeId: match.request.episodeId,
        seasonId: match.request.seasonId,
      });
      const consumedAttemptCount = await countBudgetConsumingReleaseAttemptsForItem({
        userId,
        mediaTitleId,
        episodeId: match.request.episodeId,
        seasonId: match.request.seasonId,
      });
      if (consumedAttemptCount >= maxAutoRetriesPerItem) {
        await updateDownloadRequestStatus({
          userId,
          requestId: match.request.id,
          status: "failed",
          statusMessage: `${failureMessage} Auto-retry stopped after ${consumedAttemptCount} failed download attempts for this item — fix the cause, then retry manually.`,
        });
        continue;
      }

      attemptedCount += 1;
      const retry = await searchLibraryItemReleasesWorkflow(
        userId,
        buildDownloadRequestReleaseSearchInput(
          { ...match.request, mediaTitleId },
          exclusions,
        ),
      );
      if (retry.queuedDownload.queued) {
        await updateDownloadRequestStatus({
          userId,
          requestId: match.request.id,
          status: "failed",
          statusMessage: `${failureMessage} Nooklet queued a different release automatically.`,
        });
        queuedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch (error) {
      // Silently counting these hid systematic retry failures entirely: the
      // number moved and nothing said why.
      console.error(
        `[download-import] automatic retry failed for request ${match.request.id}:`,
        error,
      );
      failedCount += 1;
    }
  }

  return { attemptedCount, queuedCount, failedCount };
}
