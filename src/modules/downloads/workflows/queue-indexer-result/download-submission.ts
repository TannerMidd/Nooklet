import { addSabnzbdUrlToQueue } from "@/lib/integrations/sabnzbd";
import { safeFetch } from "@/lib/security/safe-fetch";
import { decryptSecret } from "@/lib/security/secret-box";
import { enqueueNzbDownloadWorkflow } from "@/modules/download-engine/workflows/enqueue-nzb-download";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type ResolvedDownloadClient } from "./client-resolution";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueueIndexerResultSubmission = {
  queueIds: string[];
  category: string;
};

const maxNzbBytes = 50 * 1024 * 1024;

function getDownloadCategory(result: ResolvedQueueIndexerResult) {
  return result.result.mediaType === "tv" ? ("tv" as const) : ("movies" as const);
}

/** Fetches the NZB document itself from the indexer's download URL. */
async function fetchNzbDocument(downloadUrl: string): Promise<string> {
  const response = await safeFetch(downloadUrl, {
    timeoutMs: 60_000,
    maxBytes: maxNzbBytes,
    headers: { Accept: "application/x-nzb, application/xml, text/xml, */*" },
  });

  if (!response.ok) {
    throw new Error(`The indexer returned ${response.status} for the NZB download.`);
  }

  return response.text();
}

async function submitToEngine(
  resolvedResult: ResolvedQueueIndexerResult,
): Promise<QueueIndexerResultSubmission> {
  const category = getDownloadCategory(resolvedResult);

  try {
    const nzbXml = await fetchNzbDocument(decryptSecret(resolvedResult.secret.encryptedDownloadUrl));
    const enqueued = await enqueueNzbDownloadWorkflow(resolvedResult.result.userId, {
      name: resolvedResult.result.title,
      category,
      nzbXml,
    });

    return { queueIds: [enqueued.id], category };
  } catch (error) {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_enqueue_failed",
      error instanceof Error
        ? `Nooklet could not queue the selected release: ${error.message}`
        : "Nooklet could not queue the selected release.",
    );
  }
}

async function submitToSabnzbd(
  resolvedResult: ResolvedQueueIndexerResult,
  downloadClient: Extract<ResolvedDownloadClient, { kind: "sabnzbd" }>,
): Promise<QueueIndexerResultSubmission> {
  const category = getDownloadCategory(resolvedResult);

  try {
    const submission = await addSabnzbdUrlToQueue({
      baseUrl: downloadClient.baseUrl,
      apiKey: downloadClient.apiKey,
      url: decryptSecret(resolvedResult.secret.encryptedDownloadUrl),
      title: resolvedResult.result.title,
      category,
    });

    return { ...submission, category };
  } catch {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_enqueue_failed",
      "SABnzbd could not queue the selected release.",
    );
  }
}

export async function submitIndexerResultToDownloadClient(
  resolvedResult: ResolvedQueueIndexerResult,
  downloadClient: ResolvedDownloadClient,
): Promise<QueueIndexerResultSubmission> {
  return downloadClient.kind === "nooklet"
    ? submitToEngine(resolvedResult)
    : submitToSabnzbd(resolvedResult, downloadClient);
}
