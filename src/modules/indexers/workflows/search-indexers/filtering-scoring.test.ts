import { describe, expect, it } from "vitest";

import { filterAndScoreIndexerSearchResults } from "./filtering-scoring";
import { type NormalizedIndexerSearchExecution } from "./normalization";
import {
    normalizeIndexerSearchQuery,
    validateIndexerSearchRequest,
    type ValidatedIndexerSearchRequest,
} from "./request-validation";

describe("normalizeIndexerSearchQuery", () => {
    it("folds case, punctuation, and separators for latin titles", () => {
        expect(normalizeIndexerSearchQuery("It's Always Sunny!")).toBe("it s always sunny");
    });

    it("keeps non-latin letters instead of stripping them", () => {
        // Regression: the old [a-z0-9] normalization emptied every CJK key.
        expect(normalizeIndexerSearchQuery("天気の子")).toBe("天気の子");
        expect(normalizeIndexerSearchQuery("Parasite 기생충 (2019)")).toBe("parasite 기생충 2019");
    });

    it("normalizes compatibility forms so queries match their decomposed titles", () => {
        expect(normalizeIndexerSearchQuery("Ａｒｒｉｖａｌ")).toBe(
            normalizeIndexerSearchQuery("Arrival"),
        );
    });
});

describe("filterAndScoreIndexerSearchResults scoring", () => {
    const request: ValidatedIndexerSearchRequest = validateIndexerSearchRequest({
        mediaType: "movie",
        query: "arrival",
    });

    // The scoring pass only reads `normalizedTitle`; the rest of the record
    // shape exists to satisfy the execution type.
    function executionWith(...normalizedTitles: string[]) {
        return {
            errorMessage: null,
            source: { indexer: { id: "i1" } },
            results: normalizedTitles.map((normalizedTitle) => ({
                title: normalizedTitle,
                indexerGuid: `guid-${normalizedTitle}`,
                downloadUrl: "https://indexer.example/nzb",
                qualityLabel: null,
                sizeBytes: null,
                publishedAt: null,
                ageMinutes: null,
                seeders: null,
                leechers: null,
                grabs: null,
                normalizedTitle,
                sourceGuid: `i1:${normalizedTitle}`,
            })),
        } as unknown as NormalizedIndexerSearchExecution;
    }

    it("boosts results whose normalized title contains the query key", () => {
        const scored = filterAndScoreIndexerSearchResults(request, [
            executionWith("arrival 2016 1080p", "other movie 2018"),
        ]);

        expect(scored[0]?.results[0]?.score).toBe(100);
        expect(scored[0]?.results[1]?.score).toBe(50);
    });

    it("scores uniformly when the normalized key is empty", () => {
        // A CJK-style query used to make `includes("")` true for every title
        // and boost everything; an empty key must be relevance-neutral instead.
        const scored = filterAndScoreIndexerSearchResults({ ...request, normalizedKey: "" }, [
            executionWith("anything at all"),
        ]);

        expect(scored[0]?.results[0]?.score).toBe(50);
    });
});
