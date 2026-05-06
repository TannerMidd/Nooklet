import {
  searchNewznabIndexer,
  type NewznabSearchResult,
} from "@/modules/indexers/adapters/newznab";
import { type ValidatedIndexerSearchRequest } from "./request-validation";
import { type ResolvedIndexerSearchSource } from "./credential-resolution";

export type IndexerSearchExecution = {
  source: ResolvedIndexerSearchSource;
  results: NewznabSearchResult[];
  errorMessage: string | null;
};

export async function executeIndexerSearches(
  request: ValidatedIndexerSearchRequest,
  sources: ResolvedIndexerSearchSource[],
): Promise<IndexerSearchExecution[]> {
  const executions: IndexerSearchExecution[] = [];

  for (const source of sources) {
    try {
      const results = await searchNewznabIndexer({
        protocol: source.indexer.protocol,
        baseUrl: source.indexer.baseUrl,
        apiPath: source.indexer.apiPath,
        apiKey: source.apiKey,
        query: request.query,
        categories: source.categories,
      });
      executions.push({ source, results, errorMessage: null });
    } catch (error) {
      executions.push({
        source,
        results: [],
        errorMessage: error instanceof Error ? error.message : "Indexer search failed.",
      });
    }
  }

  return executions;
}
