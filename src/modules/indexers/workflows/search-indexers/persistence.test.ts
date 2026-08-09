import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
    maskSecret: vi.fn(() => "masked"),
}));
vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
    completeIndexerSearchRun: vi.fn(),
    createIndexerSearchRun: vi.fn(),
    listSearchResultsForRun: vi.fn(),
    recordIndexerSearchResult: vi.fn(),
}));

import {
    completeIndexerSearchRun,
    createIndexerSearchRun,
    listSearchResultsForRun,
    recordIndexerSearchResult,
} from "@/modules/indexers/repositories/indexer-repository";

import { persistIndexerSearchResults } from "./persistence";

const completeMock = vi.mocked(completeIndexerSearchRun);
const createMock = vi.mocked(createIndexerSearchRun);
const listMock = vi.mocked(listSearchResultsForRun);
const recordMock = vi.mocked(recordIndexerSearchResult);

beforeEach(() => {
    vi.clearAllMocks();
    createMock.mockResolvedValue({ id: "run-1" } as never);
    completeMock.mockImplementation(async (input) => ({ id: "run-1", ...input }) as never);
    listMock.mockResolvedValue([]);
});

describe("persistIndexerSearchResults", () => {
    it("continues when one indexer succeeds even if another fails", async () => {
        const result = await persistIndexerSearchResults(
            "user-1",
            { mediaType: "tv", query: "Severance S01E01", normalizedKey: "severance" } as never,
            [
                {
                    source: { indexer: { id: "failed-indexer" } },
                    results: [],
                    errorMessage: "Indexer returned 503 Service Unavailable.",
                },
                {
                    source: { indexer: { id: "healthy-indexer" } },
                    results: [
                        {
                            title: "Severance S01E01 1080p",
                            normalizedTitle: "severance s01e01 1080p",
                            sourceGuid: "healthy:release-1",
                            qualityLabel: "1080p",
                            sizeBytes: 1_000,
                            publishedAt: null,
                            ageMinutes: null,
                            seeders: null,
                            leechers: null,
                            grabs: null,
                            downloadUrl: "https://indexer.test/release-1",
                        },
                    ],
                    errorMessage: null,
                },
            ] as never,
        );

        expect(recordMock).toHaveBeenCalledTimes(1);
        expect(completeMock).toHaveBeenCalledWith({
            searchRunId: "run-1",
            status: "succeeded",
            resultCount: 1,
            errorMessage: "Indexer returned 503 Service Unavailable.",
        });
        expect(result.searchRun.status).toBe("succeeded");
    });

    it("fails the run when every configured indexer fails", async () => {
        await persistIndexerSearchResults(
            "user-1",
            { mediaType: "tv", query: "Severance S01E01", normalizedKey: "severance" } as never,
            [
                {
                    source: { indexer: { id: "indexer-1" } },
                    results: [],
                    errorMessage: "Indexer timed out.",
                },
                {
                    source: { indexer: { id: "indexer-2" } },
                    results: [],
                    errorMessage: "Indexer returned 429.",
                },
            ] as never,
        );

        expect(completeMock).toHaveBeenCalledWith({
            searchRunId: "run-1",
            status: "failed",
            resultCount: 0,
            errorMessage: "Indexer timed out.; Indexer returned 429.",
        });
    });
});
