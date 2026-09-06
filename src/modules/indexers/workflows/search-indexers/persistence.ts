import {
    persistIndexerSearchBatch,
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
    const errorMessages = executions
        .map((execution) => execution.errorMessage)
        .filter((message): message is string => Boolean(message));
    const noSources = executions.length === 0;
    const results = executions.flatMap((execution) =>
        execution.results.map((result) => ({
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
            downloadUrl: result.downloadUrl,
        })),
    );
    const completedRun = await persistIndexerSearchBatch({
        userId,
        mediaType: request.mediaType,
        query: request.query,
        normalizedKey: request.normalizedKey,
        status:
            noSources || (errorMessages.length === executions.length && results.length === 0)
                ? "failed"
                : "succeeded",
        errorMessage: noSources
            ? "No enabled Newznab indexers were available for this media type."
            : errorMessages.length > 0
              ? errorMessages.join("; ")
              : null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        results,
    });

    return completedRun;
}
