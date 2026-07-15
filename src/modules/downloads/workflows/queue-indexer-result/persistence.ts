import {
  recordSubmittedDownload,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedDownloadClient } from "./client-resolution";
import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultSubmission } from "./download-submission";
import { type ReservedDownloadRequest } from "./reservation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueuedIndexerResultDownload = {
  downloadRequest: Awaited<ReturnType<typeof recordSubmittedDownload>>["request"];
  queueItem: Awaited<ReturnType<typeof recordSubmittedDownload>>["queueItems"][number] | null;
  queueItems: Awaited<ReturnType<typeof recordSubmittedDownload>>["queueItems"];
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

  if (!primaryQueueId) {
    throw new QueueIndexerResultWorkflowError(
      "download_request_failed",
      "The downloader did not return a queue id, so Nooklet could not track the download.",
    );
  }

  const submitted = await recordSubmittedDownload({
    userId: input.userId,
    requestId: input.reservedRequest.id,
    clientId: input.downloadClient.client.id,
    externalQueueIds: input.submission.queueIds,
    sizeBytes: input.resolvedResult.result.sizeBytes,
    category: input.submission.category,
    statusMessage: input.downloadClient.kind === "nooklet"
      ? "Queued in the Nooklet downloader."
      : "Queued in SABnzbd.",
  });

  return {
    downloadRequest: submitted.request,
    queueItem: submitted.queueItems[0] ?? null,
    queueItems: submitted.queueItems,
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
