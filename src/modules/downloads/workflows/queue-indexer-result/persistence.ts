import {
  createDownloadRequest,
  recordDownloadQueueItem,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedSabnzbdDownloadClient } from "./client-resolution";
import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultSubmission } from "./download-submission";
import { type QueueIndexerResultInput } from "./request-validation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueuedIndexerResultDownload = {
  downloadRequest: NonNullable<Awaited<ReturnType<typeof updateDownloadRequestStatus>>>;
  queueItem: Awaited<ReturnType<typeof recordDownloadQueueItem>> | null;
  queueIds: string[];
};

export async function persistQueuedIndexerResultDownload(input: {
  userId: string;
  request: QueueIndexerResultInput;
  resolvedResult: ResolvedQueueIndexerResult;
  downloadClient: ResolvedSabnzbdDownloadClient;
  submission: QueueIndexerResultSubmission;
}): Promise<QueuedIndexerResultDownload> {
  const request = await createDownloadRequest({
    userId: input.userId,
    mediaType: input.resolvedResult.result.mediaType,
    requestedTitle: input.request.requestedTitle ?? input.resolvedResult.result.title,
    mediaTitleId: input.request.mediaTitleId ?? null,
    releaseTitle: input.resolvedResult.result.title,
    searchResultId: input.resolvedResult.result.id,
    clientId: input.downloadClient.client.id,
    targetLibraryId: input.request.targetLibraryId ?? null,
    status: "pending",
  });
  const primaryQueueId = input.submission.queueIds[0] ?? null;
  const queuedRequest = await updateDownloadRequestStatus({
    userId: input.userId,
    requestId: request.id,
    status: "queued",
    externalJobId: primaryQueueId,
    statusMessage: "Queued in SABnzbd.",
  });

  if (!queuedRequest) {
    throw new QueueIndexerResultWorkflowError(
      "download_request_failed",
      "Nooklet could not record the queued download.",
    );
  }

  const queueItem = primaryQueueId
    ? await recordDownloadQueueItem({
        requestId: request.id,
        userId: input.userId,
        clientId: input.downloadClient.client.id,
        externalQueueId: primaryQueueId,
        status: "queued",
        sizeBytes: input.resolvedResult.result.sizeBytes,
        category: input.submission.category,
      })
    : null;

  return {
    downloadRequest: queuedRequest,
    queueItem,
    queueIds: input.submission.queueIds,
  };
}
