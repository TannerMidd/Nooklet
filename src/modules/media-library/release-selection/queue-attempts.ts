import {
  queueIndexerResultWorkflow,
  QueueIndexerResultWorkflowError,
  type QueuedIndexerResultDownload,
} from "@/modules/downloads/workflows/queue-indexer-result";

import { type ReleaseCandidate } from "./candidate-selection";

const retryableQueueErrorCodes = new Set(["result_not_found", "unsupported_protocol"]);

export type QueueReleaseCandidatesContext = {
  mediaTitleId: string;
  requestedTitle: string;
  targetLibraryId: string | null;
  targetLibraryPathId: string | null;
  seasonId?: string | null;
  episodeId?: string | null;
};

export type QueuedReleaseCandidatesOutcome =
  | {
      queued: false;
      reason: "queue_failed";
      message: string | null;
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

function shouldTryNextRelease(error: QueueIndexerResultWorkflowError) {
  return retryableQueueErrorCodes.has(error.code);
}

export async function queueReleaseCandidates(
  userId: string,
  candidates: Array<Pick<ReleaseCandidate, "id">>,
  context: QueueReleaseCandidatesContext,
): Promise<QueuedReleaseCandidatesOutcome> {
  const rejectedResultIds: string[] = [];
  let lastErrorMessage: string | null = null;

  for (const candidate of candidates) {
    try {
      const download = await queueIndexerResultWorkflow(userId, {
        resultId: candidate.id,
        mediaTitleId: context.mediaTitleId,
        requestedTitle: context.requestedTitle,
        targetLibraryId: context.targetLibraryId,
        targetLibraryPathId: context.targetLibraryPathId,
        ...(context.seasonId ? { seasonId: context.seasonId } : {}),
        ...(context.episodeId ? { episodeId: context.episodeId } : {}),
      });

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

      lastErrorMessage = error.message;

      if (!shouldTryNextRelease(error)) {
        return {
          queued: false,
          reason: "queue_failed",
          message: error.message,
          selectedResultId: null,
          rejectedResultIds,
          download: null,
        };
      }

      rejectedResultIds.push(candidate.id);
    }
  }

  return {
    queued: false,
    reason: "queue_failed",
    message: lastErrorMessage,
    selectedResultId: null,
    rejectedResultIds,
    download: null,
  };
}
