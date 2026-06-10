import {
  findDownloadRequestById,
  incrementDownloadRequestRetryCount,
  listDownloadRequestReleaseExclusionsForItem,
} from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

export type RetryDownloadRequestErrorCode = "request_not_found" | "request_not_retryable";

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
  message: string | null;
};

const retryableStatuses = ["failed", "cancelled"];

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

  const exclusions = await listDownloadRequestReleaseExclusionsForItem({
    userId,
    mediaTitleId: request.mediaTitleId,
    episodeId: request.episodeId,
    seasonId: request.seasonId,
  });
  const retry = await searchLibraryItemReleasesWorkflow(userId, {
    titleId: request.mediaTitleId,
    episodeId: request.episodeId ?? undefined,
    targetLibraryPathId: request.targetLibraryPathId ?? undefined,
    excludedResultIds: exclusions.resultIds,
    excludedReleaseKeys: exclusions.releaseKeys,
  });

  return {
    queued: retry.queuedDownload.queued,
    message: retry.queuedDownload.queued ? null : retry.queuedDownload.message,
  };
}
