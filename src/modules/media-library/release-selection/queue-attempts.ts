import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
  type QueuedIndexerResultDownload,
} from "@/modules/downloads/workflows/queue-indexer-result";
import {
  classifyDownloadCapacityFailure,
  type DownloadCapacityDetails,
  type DownloadCapacityDisposition,
} from "@/modules/downloads/workflows/queue-indexer-result/errors";
import { type SeasonFulfillmentWorkLease } from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type ReleaseCandidate } from "./candidate-selection";

const retryableQueueErrorCodes = new Set([
  "result_not_found",
  "unsupported_protocol",
  "release_unavailable",
]);

export type QueueFailureKind =
  | "release"
  | "infrastructure"
  | "capacity"
  | "conflict"
  | "unknown";

export type QueueReleaseCandidatesContext = {
  mediaTitleId: string;
  requestedTitle: string;
  targetLibraryId: string | null;
  targetLibraryPathId: string | null;
  seasonId?: string | null;
  episodeId?: string | null;
  fulfillmentId?: string | null;
  attemptStrategy?: "season_pack" | "episode" | null;
  attemptNumber?: number | null;
  maxCandidateAttempts?: number | null;
  workLease?: SeasonFulfillmentWorkLease | null;
};

export type QueuedReleaseCandidatesOutcome =
  | {
      queued: false;
      reason: "queue_failed";
      message: string | null;
      failureKind: QueueFailureKind;
      capacity?: DownloadCapacityDetails | null;
      selectedResultId: null;
      rejectedResultIds: string[];
      download: null;
    }
  | {
      queued: true;
      reason: "queued";
      message: null;
      selectedResultId: string;
      rejectedResultIds: string[];
      download: QueuedIndexerResultDownload;
    };

function capacityDisposition(
  error: QueueIndexerResultWorkflowError,
): DownloadCapacityDisposition | null {
  return error.code === "download_capacity_exceeded"
    ? classifyDownloadCapacityFailure(error.capacity)
    : null;
}

function shouldTryNextRelease(error: QueueIndexerResultWorkflowError) {
  return retryableQueueErrorCodes.has(error.code)
    || capacityDisposition(error) === "candidate_oversized";
}

function consumesCandidateBudget(error: QueueIndexerResultWorkflowError) {
  return error.code === "release_unavailable"
    || capacityDisposition(error) === "candidate_oversized";
}

function queueFailureMessage(error: QueueIndexerResultWorkflowError) {
  if (capacityDisposition(error) !== "storage_insufficient") return error.message;
  return `${error.message} Active downloads do not account for this shortage. `
    + "Free space in the configured download workspace or correct its drive/volume mapping, then resume.";
}

function queueFailureKind(error: QueueIndexerResultWorkflowError): QueueFailureKind {
  if (retryableQueueErrorCodes.has(error.code)) return "release";
  if (error.code === "active_download_exists") return "conflict";
  if (error.code === "season_fulfillment_busy") return "conflict";
  if (error.code === "download_capacity_exceeded") {
    const disposition = capacityDisposition(error);
    if (disposition === "active_reservation_contention") return "capacity";
    if (disposition === "candidate_oversized") return "release";
    return "infrastructure";
  }
  if ([
    "sabnzbd_not_connected",
    "sabnzbd_not_verified",
    "sabnzbd_enqueue_failed",
    "indexer_unavailable",
    "target_path_not_found",
  ].includes(error.code)) return "infrastructure";
  return "unknown";
}

export async function queueReleaseCandidates(
  userId: string,
  candidates: Array<Pick<ReleaseCandidate, "id">>,
  context: QueueReleaseCandidatesContext,
): Promise<QueuedReleaseCandidatesOutcome> {
  const rejectedResultIds: string[] = [];
  let lastErrorMessage: string | null = null;
  let lastCapacity: DownloadCapacityDetails | null = null;
  const candidateAttemptLimit = context.maxCandidateAttempts == null
    ? candidates.length
    : Math.max(0, Math.floor(context.maxCandidateAttempts));
  let consumedCandidateAttempts = 0;

  for (const candidate of candidates) {
    if (consumedCandidateAttempts >= candidateAttemptLimit) {
      break;
    }

    try {
      const download = await queueIndexerResultWorkflow(
        userId,
        {
          resultId: candidate.id,
          mediaTitleId: context.mediaTitleId,
          requestedTitle: context.requestedTitle,
          targetLibraryId: context.targetLibraryId,
          targetLibraryPathId: context.targetLibraryPathId,
          ...(context.seasonId ? { seasonId: context.seasonId } : {}),
          ...(context.episodeId ? { episodeId: context.episodeId } : {}),
        },
        {
          fulfillmentId: context.fulfillmentId ?? null,
          attemptStrategy: context.attemptStrategy ?? null,
          attemptNumber: context.attemptNumber
            ? context.attemptNumber + consumedCandidateAttempts
            : null,
          workLease: context.workLease ?? null,
        },
      );

      return {
        queued: true,
        reason: "queued",
        message: null,
        selectedResultId: candidate.id,
        rejectedResultIds,
        download,
      };
    } catch (error) {
      if (!(error instanceof QueueIndexerResultWorkflowError)) {
        throw error;
      }

      lastErrorMessage = queueFailureMessage(error);
      if (error.capacity) lastCapacity = error.capacity;

      if (!shouldTryNextRelease(error)) {
        return {
          queued: false,
          reason: "queue_failed",
          message: queueFailureMessage(error),
          failureKind: queueFailureKind(error),
          capacity: error.capacity,
          selectedResultId: null,
          rejectedResultIds,
          download: null,
        };
      }

      if (consumesCandidateBudget(error)) {
        consumedCandidateAttempts += 1;
        rejectedResultIds.push(candidate.id);
      }
    }
  }

  return {
    queued: false,
    reason: "queue_failed",
    message: lastErrorMessage,
    failureKind: "release",
    capacity: lastCapacity,
    selectedResultId: null,
    rejectedResultIds,
    download: null,
  };
}
