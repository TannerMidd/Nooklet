import {
    type NormalizedIndexerSearchExecution,
    type NormalizedIndexerSearchResult,
} from "./normalization";
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
            // An empty key would make `includes` true for every title, so a
            // query that normalizes to nothing must score uniformly instead of
            // uniformly "matching". Ranking itself happens downstream in
            // selectReleaseCandidates (seeders/grabs/recency); this score is
            // only a relevance hint recorded with the result.
            score:
                request.normalizedKey.length > 0 &&
                result.normalizedTitle.includes(request.normalizedKey)
                    ? 100
                    : 50,
        })),
    }));
}
