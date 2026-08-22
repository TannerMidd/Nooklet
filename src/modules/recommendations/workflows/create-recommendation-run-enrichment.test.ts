import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/service-connections/adapters/tmdb", () => ({
    lookupTmdbTitleDetails: vi.fn(),
}));

import { lookupTmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";

import {
    buildStoredRecommendationItems,
    enrichGeneratedItemsWithTmdbMetadata,
    type GeneratedRecommendationItem,
} from "./create-recommendation-run-enrichment";

const lookupTmdbMock = vi.mocked(lookupTmdbTitleDetails);

function buildItem(
    overrides: Partial<GeneratedRecommendationItem> = {},
): GeneratedRecommendationItem {
    return {
        title: "Severance",
        year: 2022,
        rationale: "because workplace mystery",
        confidenceLabel: "high",
        providerMetadata: { source: "ai" },
        ...overrides,
    } as GeneratedRecommendationItem;
}

describe("buildStoredRecommendationItems", () => {
    it("assigns 1-based positions, the media type, and stringified providerMetadata to each item", () => {
        const result = buildStoredRecommendationItems("tv", [
            buildItem({ title: "A" }),
            buildItem({ title: "B", providerMetadata: { source: "ai", model: "gpt-4" } }),
        ]);

        expect(result).toEqual([
            {
                mediaType: "tv",
                position: 1,
                title: "A",
                year: 2022,
                rationale: "because workplace mystery",
                confidenceLabel: "high",
                providerMetadataJson: JSON.stringify({ source: "ai" }),
            },
            {
                mediaType: "tv",
                position: 2,
                title: "B",
                year: 2022,
                rationale: "because workplace mystery",
                confidenceLabel: "high",
                providerMetadataJson: JSON.stringify({ source: "ai", model: "gpt-4" }),
            },
        ]);
    });

    it("returns an empty array for empty input", () => {
        expect(buildStoredRecommendationItems("movie", [])).toEqual([]);
    });
});

describe("enrichGeneratedItemsWithTmdbMetadata", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const tmdbConnection = {
        baseUrl: "https://api.tmdb.test",
        secret: "tmdb-token",
        metadata: { tmdbImageBaseUrl: "https://image.tmdb.test/t/p/" },
    };

    it("keeps items unchanged when any language is allowed and TMDB is unavailable", async () => {
        const item = buildItem();
        const result = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection: null,
            mediaType: "tv",
            languagePreference: "any",
            items: [item],
        });

        expect(result).toEqual({
            ok: true,
            items: [item],
            excludedLanguageItemCount: 0,
        });
        expect(lookupTmdbMock).not.toHaveBeenCalled();
    });

    it("fails when a strict language preference lacks a TMDB connection", async () => {
        const result = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection: null,
            mediaType: "movie",
            languagePreference: "de",
            items: [buildItem()],
        });

        expect(result).toEqual({
            ok: false,
            message:
                "Verify TMDB before requesting German recommendations. TMDB is required to strictly confirm each title's original language.",
        });
    });

    it("attaches TMDB details and filters out mismatched original languages", async () => {
        lookupTmdbMock.mockImplementation(async (input) => {
            if (input.title === "Dark") {
                return {
                    ok: true,
                    details: {
                        source: "tmdb",
                        tmdbId: 99,
                        mediaType: "tv",
                        title: "Dark",
                        originalTitle: "Dark",
                        overview: "German series.",
                        tagline: null,
                        year: 2017,
                        releaseDate: "2017-12-01",
                        originalLanguage: "de",
                        posterUrl: "https://image.tmdb.test/t/p/w500/dark.jpg",
                        backdropUrl: null,
                        genres: ["Mystery"],
                        runtimeMinutes: 53,
                        seasonCount: 3,
                        status: "Ended",
                        voteAverage: 8.4,
                        voteCount: 5000,
                        homepage: null,
                        imdbId: null,
                        tvdbId: 334824,
                        videos: [],
                        cast: [],
                        watchProviders: null,
                        similarTitles: [],
                    },
                };
            }

            return {
                ok: true,
                details: {
                    source: "tmdb",
                    tmdbId: 1,
                    mediaType: "tv",
                    title: "Severance",
                    originalTitle: "Severance",
                    overview: "English series.",
                    tagline: null,
                    year: 2022,
                    releaseDate: "2022-02-18",
                    originalLanguage: "en",
                    posterUrl: null,
                    backdropUrl: null,
                    genres: ["Drama"],
                    runtimeMinutes: null,
                    seasonCount: 2,
                    status: "Returning Series",
                    voteAverage: 8,
                    voteCount: 1000,
                    homepage: null,
                    imdbId: null,
                    tvdbId: null,
                    videos: [],
                    cast: [],
                    watchProviders: null,
                    similarTitles: [],
                },
            };
        });

        const result = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "tv",
            languagePreference: "de",
            items: [
                buildItem({ title: "Dark", year: null }),
                buildItem({ title: "Severance", year: 2022 }),
            ],
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            throw new Error("Expected TMDB enrichment to succeed.");
        }

        expect(result.excludedLanguageItemCount).toBe(1);
        expect(result.items).toHaveLength(1);
        expect(result.items[0]).toMatchObject({
            title: "Dark",
            year: 2017,
            providerMetadata: {
                source: "ai",
                posterUrl: "https://image.tmdb.test/t/p/w500/dark.jpg",
                tmdbDetails: {
                    originalLanguage: "de",
                    overview: "German series.",
                },
            },
        });
    });

    it("memoizes duplicate titles within a call and across calls sharing a cache", async () => {
        lookupTmdbMock.mockResolvedValue({ ok: false, message: "No TMDB match was found." });

        const first = buildItem({ title: "Dune", year: 2021 });
        const duplicate = buildItem({ title: "dune ", year: 2021 });

        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [first, duplicate],
        });

        expect(lookupTmdbMock).toHaveBeenCalledTimes(1);

        const sharedCache = new Map();

        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [first],
            cache: sharedCache,
        });
        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [duplicate],
            cache: sharedCache,
        });

        // The second call reused the first call's cached lookup.
        expect(lookupTmdbMock).toHaveBeenCalledTimes(2);
    });

    it("evicts transient failures from a shared cache but keeps definitive misses", async () => {
        const sharedCache = new Map();

        lookupTmdbMock.mockResolvedValueOnce({
            ok: false,
            message: "TMDB search failed with status 503.",
        });
        lookupTmdbMock.mockResolvedValueOnce({
            ok: false,
            message: "No TMDB match was found for Ghost (1990).",
        });

        const item = buildItem({ title: "Ghost", year: 1990 });

        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [item],
            cache: sharedCache,
        });
        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [item],
            cache: sharedCache,
        });

        // The 503 evicted itself and was retried on the second pass.
        expect(lookupTmdbMock).toHaveBeenCalledTimes(2);

        await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [item],
            cache: sharedCache,
        });

        // The definitive no-match verdict stays cached.
        expect(lookupTmdbMock).toHaveBeenCalledTimes(2);
    });

    it("evicts rejected lookups so a shared cache can retry them", async () => {
        const sharedCache = new Map();
        const item = buildItem({ title: "Retry me", year: 2022 });

        lookupTmdbMock.mockRejectedValueOnce(new Error("TMDB request timed out."));
        lookupTmdbMock.mockResolvedValueOnce({
            ok: false,
            message: "No TMDB match was found for Retry me (2022).",
        });

        await expect(
            enrichGeneratedItemsWithTmdbMetadata({
                tmdbConnection,
                mediaType: "movie",
                languagePreference: "any",
                items: [item],
                cache: sharedCache,
            }),
        ).rejects.toThrow("TMDB request timed out.");

        expect(sharedCache).toHaveLength(0);

        const retryResult = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "movie",
            languagePreference: "any",
            items: [item],
            cache: sharedCache,
        });

        expect(retryResult).toEqual({
            ok: true,
            items: [item],
            excludedLanguageItemCount: 0,
        });
        expect(lookupTmdbMock).toHaveBeenCalledTimes(2);
    });

    it("preserves input order under concurrent enrichment regardless of lookup timing", async () => {
        lookupTmdbMock.mockImplementation(async (input) => {
            const delay = input.title === "slow-a" || input.title === "slow-b" ? 20 : 1;

            await new Promise((resolve) => setTimeout(resolve, delay));

            return { ok: false, message: `no match for ${input.title}` };
        });

        const items = [
            buildItem({ title: "slow-a" }),
            buildItem({ title: "fast-1" }),
            buildItem({ title: "fast-2" }),
            buildItem({ title: "fast-3" }),
            buildItem({ title: "fast-4" }),
            buildItem({ title: "slow-b" }),
        ];

        const result = await enrichGeneratedItemsWithTmdbMetadata({
            tmdbConnection,
            mediaType: "tv",
            languagePreference: "any",
            items,
        });

        expect(result.ok).toBe(true);

        if (!result.ok) {
            throw new Error("Expected TMDB enrichment to succeed.");
        }

        expect(result.items.map((item) => item.title)).toEqual([
            "slow-a",
            "fast-1",
            "fast-2",
            "fast-3",
            "fast-4",
            "slow-b",
        ]);
    });
});
