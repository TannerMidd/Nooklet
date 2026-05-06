import { type NormalizedIndexerSearchExecution, type NormalizedIndexerSearchResult } from "./normalization";
import { type ValidatedIndexerSearchRequest } from "./request-validation";

export type ScoredIndexerSearchResult = NormalizedIndexerSearchResult & {
  score: number;
};

export type ScoredIndexerSearchExecution = Omit<NormalizedIndexerSearchExecution, "results"> & {
  results: ScoredIndexerSearchResult[];
};

export function filterAndScoreIndexerSearchResults(
  request: ValidatedIndexerSearchRequest,
  executions: NormalizedIndexerSearchExecution[],
): ScoredIndexerSearchExecution[] {
  return executions.map((execution) => ({
    ...execution,
    results: execution.results.map((result) => ({
      ...result,
      score: result.normalizedTitle.includes(request.normalizedKey) ? 100 : 50,
    })),
  }));
}
