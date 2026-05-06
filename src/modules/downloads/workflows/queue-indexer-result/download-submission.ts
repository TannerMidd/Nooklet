import { addSabnzbdUrlToQueue } from "@/lib/integrations/sabnzbd";
import { decryptSecret } from "@/lib/security/secret-box";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type ResolvedSabnzbdDownloadClient } from "./client-resolution";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

export type QueueIndexerResultSubmission = {
  queueIds: string[];
  category: string;
};

function getSabnzbdCategory(result: ResolvedQueueIndexerResult) {
  return result.result.mediaType === "tv" ? "tv" : "movies";
}

export async function submitIndexerResultToSabnzbd(
  resolvedResult: ResolvedQueueIndexerResult,
  downloadClient: ResolvedSabnzbdDownloadClient,
): Promise<QueueIndexerResultSubmission> {
  const category = getSabnzbdCategory(resolvedResult);

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
