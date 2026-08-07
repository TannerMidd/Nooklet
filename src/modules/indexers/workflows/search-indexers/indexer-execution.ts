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

/**
 * Queries every configured indexer concurrently.
 *
 * Running them in sequence made one unresponsive indexer cost a full 30-second
 * timeout before the next was even tried, inside user-facing requests and once
 * per fulfillment in the season-recovery loop. Each call already has its own
 * timeout and failure handling, so there is nothing to serialize for.
 */
export async function executeIndexerSearches(
    request: ValidatedIndexerSearchRequest,
    sources: ResolvedIndexerSearchSource[],
): Promise<IndexerSearchExecution[]> {
    const isTvSelection =
        request.mediaType === "tv" &&
        (typeof request.season === "number" || typeof request.episode === "number");

    return Promise.all(
        sources.map(async (source): Promise<IndexerSearchExecution> => {
            try {
                const results = await searchNewznabIndexer({
                    protocol: source.indexer.protocol,
                    baseUrl: source.indexer.baseUrl,
                    apiPath: source.indexer.apiPath,
                    apiKey: source.apiKey,
                    query: request.query,
                    categories: source.categories,
                    searchType: isTvSelection ? "tvsearch" : "search",
                    ...(typeof request.tvdbId === "number" ? { tvdbId: request.tvdbId } : {}),
                    ...(typeof request.season === "number" ? { season: request.season } : {}),
                    ...(typeof request.episode === "number" ? { episode: request.episode } : {}),
                });

                return { source, results, errorMessage: null };
            } catch (error) {
                return {
                    source,
                    results: [],
                    errorMessage: error instanceof Error ? error.message : "Indexer search failed.",
                };
            }
        }),
    );
}
