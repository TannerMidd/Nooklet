import { recordQueuedIndexerResultAudit } from "./audit";
import { resolveSabnzbdDownloadClient } from "./client-resolution";
import { submitIndexerResultToSabnzbd } from "./download-submission";
import { persistQueuedIndexerResultDownload } from "./persistence";
import {
  validateQueueIndexerResultRequest,
  type QueueIndexerResultInput,
} from "./request-validation";
import { resolveQueueIndexerResult } from "./result-resolution";

export async function queueIndexerResultWorkflow(userId: string, input: QueueIndexerResultInput) {
  const request = validateQueueIndexerResultRequest(input);
  const resolvedResult = await resolveQueueIndexerResult(userId, request);
  const downloadClient = await resolveSabnzbdDownloadClient(userId);
  const submission = await submitIndexerResultToSabnzbd(resolvedResult, downloadClient);
  const queuedDownload = await persistQueuedIndexerResultDownload({
    userId,
    request,
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
