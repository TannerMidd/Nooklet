import { addSabnzbdUrlToQueue, removeSabnzbdQueueItem } from "@/lib/integrations/sabnzbd";
import { safeFetch } from "@/lib/security/safe-fetch";
import { decryptSecret } from "@/lib/security/secret-box";
import {
  EnqueueNzbDownloadError,
  enqueueNzbDownloadWorkflow,
} from "@/modules/download-engine/workflows/enqueue-nzb-download";
import { applyEngineQueueAction } from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { findIndexerById } from "@/modules/indexers/repositories/indexer-repository";

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
    throw new QueueIndexerResultWorkflowError(
      response.status === 404 || response.status === 410
        ? "release_unavailable"
        : "indexer_unavailable",
      `The indexer returned ${response.status} for the NZB download.`,
    );
  }

  return response.text();
}

async function submitToEngine(
  resolvedResult: ResolvedQueueIndexerResult,
): Promise<QueueIndexerResultSubmission> {
  const category = getDownloadCategory(resolvedResult);

  try {
    const downloadUrl = decryptSecret(resolvedResult.secret.encryptedDownloadUrl);
    const indexer = resolvedResult.result.indexerId
      ? await findIndexerById(resolvedResult.result.userId, resolvedResult.result.indexerId)
      : null;

    if (!indexer) {
      throw new Error("The indexer that supplied this release is no longer available.");
    }

    let downloadOrigin: string;
    let indexerOrigin: string;

    try {
      downloadOrigin = new URL(downloadUrl).origin;
      indexerOrigin = new URL(indexer.baseUrl).origin;
    } catch {
      throw new Error("The indexer returned an invalid NZB download URL.");
    }

    if (downloadOrigin !== indexerOrigin) {
      throw new Error("The indexer returned an NZB URL from an unapproved host.");
    }

    const nzbXml = await fetchNzbDocument(downloadUrl);
    const enqueued = await enqueueNzbDownloadWorkflow(resolvedResult.result.userId, {
      name: resolvedResult.result.title,
      category,
      nzbXml,
    });

    return { queueIds: [enqueued.id], category };
  } catch (error) {
    if (error instanceof QueueIndexerResultWorkflowError) {
      throw error;
    }

    if (error instanceof EnqueueNzbDownloadError) {
      throw new QueueIndexerResultWorkflowError(
        error.code === "invalid_nzb"
          ? "release_unavailable"
          : "download_capacity_exceeded",
        error.message,
        error.capacity,
      );
    }

    throw new QueueIndexerResultWorkflowError(
      error instanceof TypeError ? "release_unavailable" : "indexer_unavailable",
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

    if (submission.queueIds.length === 0) {
      throw new Error("SABnzbd accepted the request but returned no queue id.");
    }

    return { ...submission, category };
  } catch {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_enqueue_failed",
      "SABnzbd could not queue the selected release.",
    );
  }
}

/** Best-effort rollback when the remote enqueue succeeded but local persistence failed. */
export async function compensateIndexerResultSubmission(
  userId: string,
  downloadClient: ResolvedDownloadClient,
  submission: QueueIndexerResultSubmission,
) {
  const failures: unknown[] = [];

  for (const queueId of submission.queueIds) {
    try {
      if (downloadClient.kind === "nooklet") {
        await applyEngineQueueAction(userId, { type: "remove", itemId: queueId });
      } else {
        await removeSabnzbdQueueItem({
          baseUrl: downloadClient.baseUrl,
          apiKey: downloadClient.apiKey,
          itemId: queueId,
        });
      }
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new AggregateError(failures, "The submitted download could not be rolled back.");
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
