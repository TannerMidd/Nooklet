import { encryptSecret, maskSecret } from "@/lib/security/secret-box";
import {
  completeIndexerSearchRun,
  createIndexerSearchRun,
  listSearchResultsForRun,
  recordIndexerSearchResult,
  type IndexerSearchResultRecord,
  type IndexerSearchRunRecord,
} from "@/modules/indexers/repositories/indexer-repository";
import { type ValidatedIndexerSearchRequest } from "./request-validation";
import { type ScoredIndexerSearchExecution } from "./filtering-scoring";

export type PersistedIndexerSearch = {
  searchRun: IndexerSearchRunRecord;
  results: IndexerSearchResultRecord[];
};

export async function persistIndexerSearchResults(
  userId: string,
  request: ValidatedIndexerSearchRequest,
  executions: ScoredIndexerSearchExecution[],
): Promise<PersistedIndexerSearch> {
  const searchRun = await createIndexerSearchRun({
    userId,
    mediaType: request.mediaType,
    query: request.query,
    normalizedKey: request.normalizedKey,
    status: "running",
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  let resultCount = 0;

  for (const execution of executions) {
    for (const result of execution.results) {
      await recordIndexerSearchResult({
        searchRunId: searchRun.id,
        userId,
        indexerId: execution.source.indexer.id,
        mediaType: request.mediaType,
        title: result.title,
        normalizedTitle: result.normalizedTitle,
        indexerGuid: result.sourceGuid,
        qualityLabel: result.qualityLabel,
        sizeBytes: result.sizeBytes,
        publishedAt: result.publishedAt,
        ageMinutes: result.ageMinutes,
        seeders: result.seeders,
        leechers: result.leechers,
        grabs: result.grabs,
        encryptedDownloadUrl: encryptSecret(result.downloadUrl),
        maskedDownloadUrl: maskSecret(result.downloadUrl),
      });
      resultCount += 1;
    }
  }

  const errorMessages = executions
    .map((execution) => execution.errorMessage)
    .filter((message): message is string => Boolean(message));
  const noSources = executions.length === 0;
  const completedRun = await completeIndexerSearchRun({
    searchRunId: searchRun.id,
    status: noSources || (errorMessages.length === executions.length && resultCount === 0)
      ? "failed"
      : "succeeded",
    resultCount,
    errorMessage: noSources
      ? "No enabled indexers were available for this media type."
      : errorMessages.length > 0 ? errorMessages.join("; ") : null,
  });

  return {
    searchRun: completedRun,
    results: await listSearchResultsForRun(userId, searchRun.id),
  };
}
