import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    encryptSecret: vi.fn((value: string) => `encrypted:${value}`),
    maskSecret: vi.fn(() => "masked"),
}));
vi.mock("@/modules/indexers/repositories/indexer-repository", () => ({
    persistIndexerSearchBatch: vi.fn(),
}));

import { persistIndexerSearchBatch } from "@/modules/indexers/repositories/indexer-repository";

import { persistIndexerSearchResults } from "./persistence";

const persistMock = vi.mocked(persistIndexerSearchBatch);

beforeEach(() => {
    vi.clearAllMocks();
    persistMock.mockImplementation(
        async (input) =>
            ({
                searchRun: {
                    id: "run-1",
                    status: input.status,
                    resultCount: input.results.length,
                    errorMessage: input.errorMessage ?? null,
                },
                results: input.results.map((result, index) => ({
                    id: `result-${index + 1}`,
                    ...result,
                })),
            }) as never,
    );
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

        expect(persistMock).toHaveBeenCalledWith({
            userId: "user-1",
            mediaType: "tv",
            query: "Severance S01E01",
            normalizedKey: "severance",
            status: "succeeded",
            errorMessage: "Indexer returned 503 Service Unavailable.",
            expiresAt: expect.any(Date),
            results: [
                expect.objectContaining({
                    indexerId: "healthy-indexer",
                    indexerGuid: "healthy:release-1",
                    downloadUrl: "https://indexer.test/release-1",
                }),
            ],
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

        expect(persistMock).toHaveBeenCalledWith({
            userId: "user-1",
            mediaType: "tv",
            query: "Severance S01E01",
            normalizedKey: "severance",
            status: "failed",
            errorMessage: "Indexer timed out.; Indexer returned 429.",
            expiresAt: expect.any(Date),
            results: [],
        });
    });
});
