import { recordQueuedIndexerResultAudit } from "./audit";
import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { resolveSabnzbdDownloadClient } from "./client-resolution";
import { submitIndexerResultToSabnzbd } from "./download-submission";
import {
  failReservedDownloadRequest,
  persistQueuedIndexerResultDownload,
} from "./persistence";
import {
  validateQueueIndexerResultRequest,
  type QueueIndexerResultInput,
} from "./request-validation";
import { reserveDownloadRequest } from "./reservation";
import { resolveQueueIndexerResult } from "./result-resolution";
import { resolveQueueIndexerResultTarget } from "./target-resolution";

export async function queueIndexerResultWorkflow(userId: string, input: QueueIndexerResultInput) {
  const request = validateQueueIndexerResultRequest(input);
  await ensureNoActiveDownloadRequest(userId, request);
  const resolvedResult = await resolveQueueIndexerResult(userId, request);
  const target = await resolveQueueIndexerResultTarget(userId, request, resolvedResult);
  const downloadClient = await resolveSabnzbdDownloadClient(userId);
  const reservedRequest = await reserveDownloadRequest({
    userId,
    request,
    resolvedResult,
    target,
    downloadClient,
  });

  let submission;
  try {
    submission = await submitIndexerResultToSabnzbd(resolvedResult, downloadClient);
  } catch (error) {
    await failReservedDownloadRequest({
      userId,
      reservedRequest,
      reason: error instanceof Error ? error.message : "SABnzbd submission failed.",
    });
    throw error;
  }

  const queuedDownload = await persistQueuedIndexerResultDownload({
    userId,
    reservedRequest,
    resolvedResult,
    downloadClient,
    submission,
  });

  await recordQueuedIndexerResultAudit({ userId, resolvedResult, queuedDownload });

  return queuedDownload;
}

export { queueIndexerResultInputSchema } from "./request-validation";
export { QueueIndexerResultWorkflowError } from "./errors";
export type { QueueIndexerResultInput } from "./request-validation";
export type { QueuedIndexerResultDownload } from "./persistence";
