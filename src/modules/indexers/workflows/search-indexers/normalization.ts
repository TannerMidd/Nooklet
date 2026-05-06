import { type NewznabSearchResult } from "@/modules/indexers/adapters/newznab";
import { type IndexerSearchExecution } from "./indexer-execution";
import { normalizeIndexerSearchQuery } from "./request-validation";

export type NormalizedIndexerSearchResult = NewznabSearchResult & {
  normalizedTitle: string;
  sourceGuid: string;
};

export type NormalizedIndexerSearchExecution = Omit<IndexerSearchExecution, "results"> & {
  results: NormalizedIndexerSearchResult[];
};

export function normalizeIndexerSearchResults(
  executions: IndexerSearchExecution[],
): NormalizedIndexerSearchExecution[] {
  return executions.map((execution) => ({
    ...execution,
    results: execution.results.map((result) => ({
      ...result,
      normalizedTitle: normalizeIndexerSearchQuery(result.title),
      sourceGuid: `${execution.source.indexer.id}:${result.indexerGuid}`,
    })),
  }));
}
