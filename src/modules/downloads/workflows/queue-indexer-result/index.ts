import { recordQueuedIndexerResultAudit } from "./audit";
import { ensureNoActiveDownloadRequest } from "./active-download-guard";
import { validateQueueIndexerResultAssociations } from "./association-validation";
import { resolveDownloadClient } from "./client-resolution";
import {
  compensateIndexerResultSubmission,
  submitIndexerResultToDownloadClient,
} from "./download-submission";
import {
  failReservedDownloadRequest,
  persistQueuedIndexerResultDownload,
} from "./persistence";
import { ensureSabnzbdCompatibleResult } from "./protocol-guard";
import {
  validateQueueIndexerResultRequest,
  type QueueIndexerResultInput,
} from "./request-validation";
import { reserveDownloadRequest } from "./reservation";
import { resolveQueueIndexerResult } from "./result-resolution";
import { resolveQueueIndexerResultTarget } from "./target-resolution";

export async function queueIndexerResultWorkflow(userId: string, input: QueueIndexerResultInput) {
  const request = validateQueueIndexerResultRequest(input);
  const resolvedResult = await resolveQueueIndexerResult(userId, request);
  await validateQueueIndexerResultAssociations(userId, request, resolvedResult);
  await ensureNoActiveDownloadRequest(userId, request);
  ensureSabnzbdCompatibleResult(resolvedResult);
  const target = await resolveQueueIndexerResultTarget(userId, request, resolvedResult);
  const downloadClient = await resolveDownloadClient(userId);
  const reservedRequest = await reserveDownloadRequest({
    userId,
    request,
    resolvedResult,
    target,
    downloadClient,
  });

  let submission;
  try {
    submission = await submitIndexerResultToDownloadClient(resolvedResult, downloadClient);
  } catch (error) {
    await failReservedDownloadRequest({
      userId,
      reservedRequest,
      reason: error instanceof Error ? error.message : "The download submission failed.",
    });
    throw error;
  }

  let queuedDownload;
  try {
    queuedDownload = await persistQueuedIndexerResultDownload({
      userId,
      reservedRequest,
      resolvedResult,
      downloadClient,
      submission,
    });
  } catch (error) {
    let compensationFailed = false;

    try {
      await compensateIndexerResultSubmission(userId, downloadClient, submission);
    } catch {
      compensationFailed = true;
    }

    const reason = error instanceof Error ? error.message : "The queued download could not be recorded.";
    await failReservedDownloadRequest({
      userId,
      reservedRequest,
      reason: compensationFailed
        ? `${reason} The downloader accepted the job, but automatic cleanup also failed; remove it manually.`
        : `${reason} The downloader job was removed automatically.`,
    });
    throw error;
  }

  await recordQueuedIndexerResultAudit({ userId, resolvedResult, queuedDownload });

  return queuedDownload;
}

export { queueIndexerResultInputSchema } from "./request-validation";
export { QueueIndexerResultWorkflowError } from "./errors";
export type { QueueIndexerResultInput } from "./request-validation";
export type { QueuedIndexerResultDownload } from "./persistence";
