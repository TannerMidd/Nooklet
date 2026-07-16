import {
  findDownloadRequestById,
  incrementDownloadRequestRetryCount,
  listDownloadRequestReleaseExclusionsForItem,
} from "@/modules/downloads/repositories/download-repository";
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
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { buildDownloadRequestReleaseSearchInput } from "./download-request-release-search-input";

export type RetryDownloadRequestErrorCode =
  | "request_not_found"
  | "request_not_retryable"
  | "fulfillment_not_found"
  | "fulfillment_not_retryable";

export class RetryDownloadRequestWorkflowError extends Error {
  constructor(
    public readonly code: RetryDownloadRequestErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "RetryDownloadRequestWorkflowError";
  }
}

export type RetryDownloadRequestResult = {
  queued: boolean;
  reason: "queued" | "episode_fallback" | "search_failed" | "no_matching_release" | "queue_failed";
  message: string | null;
};

export type ResumeSeasonFulfillmentResult = {
  resumed: boolean;
  queuedCount: number;
  message: string;
};

const retryableStatuses = ["failed", "cancelled"];
const openFulfillmentStatuses = ["active", "retry_wait", "partial"];
const retryableFulfillmentStatuses = ["blocked", "failed", "cancelled"];

/**
 * Manually resumes the durable season intent, never just the physical attempt
 * that happened to represent it in Activity. Episode-mode plans force a fresh
 * reconciliation of every eligible missing child through attemptSeasonPack.
 */
export async function resumeSeasonFulfillmentWorkflow(
  userId: string,
  fulfillmentId: string,
): Promise<ResumeSeasonFulfillmentResult> {
  const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);
  if (!fulfillment) {
    throw new RetryDownloadRequestWorkflowError(
      "fulfillment_not_found",
      "That season recovery plan is no longer available.",
    );
  }
  if (
    !retryableFulfillmentStatuses.includes(fulfillment.status)
    && !fulfillment.cancellationRequestedAt
  ) {
    throw new RetryDownloadRequestWorkflowError(
      "fulfillment_not_retryable",
      openFulfillmentStatuses.includes(fulfillment.status)
        ? "That season is already recovering automatically."
        : "That season recovery plan is already complete.",
    );
  }

  const recovery = await attemptSeasonPack(userId, fulfillment.id, { force: true });
  const updated = await findDownloadFulfillmentById(userId, recovery.fulfillment.id);
  const queuedCount = recovery.releaseSearch?.queuedDownload.queued
    ? 1
    : recovery.fallback?.queuedCount ?? 0;
  const completed = updated?.status === "succeeded";
  const resumed = !!updated
    && !updated.cancellationRequestedAt
    && (
      openFulfillmentStatuses.includes(updated.status)
      || completed
    );

  return {
    resumed,
    queuedCount,
    message: completed
      ? updated.statusMessage ?? "Season coverage is already complete."
      : resumed
      ? queuedCount > 0
        ? `Season recovery resumed and queued ${queuedCount} new download${queuedCount === 1 ? "" : "s"}.`
        : "Season recovery resumed. Nooklet will keep checking every missing episode automatically."
      : updated?.statusMessage
        ?? recovery.fallback?.message
        ?? recovery.releaseSearch?.queuedDownload.message
        ?? "Season recovery still needs attention before it can continue.",
  };
}

export async function retryDownloadRequestWorkflow(
  userId: string,
  requestId: string,
): Promise<RetryDownloadRequestResult> {
  const request = await findDownloadRequestById(userId, requestId);

  if (!request) {
    throw new RetryDownloadRequestWorkflowError(
      "request_not_found",
      "That download request is no longer available.",
    );
  }

  if (!retryableStatuses.includes(request.status) || !request.mediaTitleId) {
    throw new RetryDownloadRequestWorkflowError(
      "request_not_retryable",
      "Only failed or cancelled library downloads can be retried.",
    );
  }

  await incrementDownloadRequestRetryCount({ userId, requestId: request.id });

  if (request.fulfillmentId && request.episodeId) {
    const episode = await findTvEpisodeByIdForUser(userId, request.episodeId);
    if (!episode) {
      return { queued: false, reason: "no_matching_release", message: "That episode is no longer available in the library." };
    }
    const queued = await markFulfillmentEpisodeFailedAndRetry({
      userId,
      fulfillmentId: request.fulfillmentId,
      episode: episode.episode,
      failureMessage: request.statusMessage ?? "The previous episode release failed.",
    });
    return {
      queued,
      reason: queued ? "queued" : "no_matching_release",
      message: queued ? null : "Immediate alternatives are exhausted; Nooklet will search again automatically.",
    };
  }

  if (request.seasonId && !request.episodeId) {
    const existingFulfillment = request.fulfillmentId
      ? await findDownloadFulfillmentById(userId, request.fulfillmentId)
      : null;
    const fulfillment = existingFulfillment ?? await createSeasonFulfillment({
      userId,
      mediaTitleId: request.mediaTitleId,
      seasonId: request.seasonId,
      requestedTitle: request.requestedTitle,
      targetLibraryPathId: request.targetLibraryPathId,
    });
    if (!request.fulfillmentId) {
      await attachDownloadRequestToFulfillment({
        userId,
        fulfillmentId: fulfillment.id,
        requestId: request.id,
        attemptStrategy: "season_pack",
        attemptNumber: Math.max(1, fulfillment.packAttemptCount + 1),
      });
    }
    const recovery = await attemptSeasonPack(userId, fulfillment.id);
    if (recovery.releaseSearch?.queuedDownload.queued) {
      return { queued: true, reason: "queued", message: null };
    }
    if (recovery.fallback) {
      const active = recovery.fallback.queuedCount + recovery.fallback.activeCount;
      return {
        queued: active > 0,
        reason: active > 0 ? "episode_fallback" : "no_matching_release",
        message: recovery.fallback.message,
      };
    }
    const outcome = recovery.releaseSearch?.queuedDownload;
    return {
      queued: false,
      reason: outcome?.reason === "search_failed" ? "search_failed" : "queue_failed",
      message: outcome?.message ?? recovery.fulfillment.statusMessage,
    };
  }

  const exclusions = await listDownloadRequestReleaseExclusionsForItem({
    userId,
    mediaTitleId: request.mediaTitleId,
    episodeId: request.episodeId,
    seasonId: request.seasonId,
  });
  const retry = await searchLibraryItemReleasesWorkflow(
    userId,
    buildDownloadRequestReleaseSearchInput(
      { ...request, mediaTitleId: request.mediaTitleId },
      exclusions,
    ),
  );

  return {
    queued: retry.queuedDownload.queued,
    reason: retry.queuedDownload.reason,
    message: retry.queuedDownload.queued ? null : retry.queuedDownload.message,
  };
}
