import {
  resolveSearchResultForDownload,
  type DownloadableIndexerSearchResult,
} from "@/modules/indexers/queries/resolve-search-result-for-download";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultInput } from "./request-validation";

export type ResolvedQueueIndexerResult = DownloadableIndexerSearchResult;

export async function resolveQueueIndexerResult(
  userId: string,
  request: QueueIndexerResultInput,
): Promise<ResolvedQueueIndexerResult> {
  const resolved = await resolveSearchResultForDownload(userId, request.resultId);

  if (!resolved) {
    throw new QueueIndexerResultWorkflowError(
      "result_not_found",
      "That search result is no longer available.",
    );
  }

  return resolved;
}
