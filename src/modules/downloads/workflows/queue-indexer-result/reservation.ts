import {
  createDownloadRequest,
  isActiveDownloadRequestUniqueViolation,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedDownloadClient } from "./client-resolution";
import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultInput } from "./request-validation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";
import { type ResolvedQueueIndexerResultTarget } from "./target-resolution";

export type ReservedDownloadRequest = Awaited<ReturnType<typeof createDownloadRequest>>;

export async function reserveDownloadRequest(input: {
  userId: string;
  request: QueueIndexerResultInput;
  resolvedResult: ResolvedQueueIndexerResult;
  target: ResolvedQueueIndexerResultTarget;
  downloadClient: ResolvedDownloadClient;
}): Promise<ReservedDownloadRequest> {
  try {
    return await createDownloadRequest({
      userId: input.userId,
      mediaType: input.resolvedResult.result.mediaType,
      requestedTitle: input.request.requestedTitle ?? input.resolvedResult.result.title,
      mediaTitleId: input.request.mediaTitleId ?? null,
      episodeId: input.request.episodeId ?? null,
      seasonId: input.request.seasonId ?? null,
      releaseTitle: input.resolvedResult.result.title,
      searchResultId: input.resolvedResult.result.id,
      clientId: input.downloadClient.client.id,
      targetLibraryId: input.target?.library.id ?? input.request.targetLibraryId ?? null,
      targetLibraryPathId: input.target?.path.id ?? null,
      status: "pending",
    });
  } catch (error) {
    if (isActiveDownloadRequestUniqueViolation(error)) {
      throw new QueueIndexerResultWorkflowError(
        "active_download_exists",
        "This library item already has an active download in progress.",
      );
    }
    throw error;
  }
}
