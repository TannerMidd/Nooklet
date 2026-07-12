import {
  markDownloadRequestSubmitted,
  recordDownloadQueueItem,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedDownloadClient } from "./client-resolution";
import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultSubmission } from "./download-submission";
import { type ReservedDownloadRequest } from "./reservation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueuedIndexerResultDownload = {
  downloadRequest: NonNullable<Awaited<ReturnType<typeof markDownloadRequestSubmitted>>>;
  queueItem: Awaited<ReturnType<typeof recordDownloadQueueItem>> | null;
  queueItems: Awaited<ReturnType<typeof recordDownloadQueueItem>>[];
  queueIds: string[];
};

export async function persistQueuedIndexerResultDownload(input: {
  userId: string;
  reservedRequest: ReservedDownloadRequest;
  resolvedResult: ResolvedQueueIndexerResult;
  downloadClient: ResolvedDownloadClient;
  submission: QueueIndexerResultSubmission;
}): Promise<QueuedIndexerResultDownload> {
  const primaryQueueId = input.submission.queueIds[0] ?? null;

  const queuedRequest = await markDownloadRequestSubmitted({
    userId: input.userId,
    requestId: input.reservedRequest.id,
    status: "queued",
    externalJobId: primaryQueueId,
    statusMessage: input.downloadClient.kind === "nooklet"
      ? "Queued in the Nooklet downloader."
      : "Queued in SABnzbd.",
  });

  if (!queuedRequest) {
    throw new QueueIndexerResultWorkflowError(
      "download_request_failed",
      "Nooklet could not record the queued download.",
    );
  }

  const queueItems: Awaited<ReturnType<typeof recordDownloadQueueItem>>[] = [];
  for (const externalQueueId of input.submission.queueIds) {
    const item = await recordDownloadQueueItem({
      requestId: input.reservedRequest.id,
      userId: input.userId,
      clientId: input.downloadClient.client.id,
      externalQueueId,
      status: "queued",
      sizeBytes: input.resolvedResult.result.sizeBytes,
      category: input.submission.category,
    });
    queueItems.push(item);
  }

  return {
    downloadRequest: queuedRequest,
    queueItem: queueItems[0] ?? null,
    queueItems,
    queueIds: input.submission.queueIds,
  };
}

export async function failReservedDownloadRequest(input: {
  userId: string;
  reservedRequest: ReservedDownloadRequest;
  reason: string;
}) {
  await updateDownloadRequestStatus({
    userId: input.userId,
    requestId: input.reservedRequest.id,
    status: "failed",
    statusMessage: input.reason,
  });
}
