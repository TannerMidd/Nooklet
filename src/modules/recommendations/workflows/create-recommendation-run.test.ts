import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/security/secret-box", () => ({
    decryptSecret: vi.fn((value: string) => `decrypted:${value}`),
}));

vi.mock("@/modules/preferences/repositories/preferences-repository", () => ({
    getPreferencesByUserId: vi.fn(),
}));

vi.mock("@/modules/service-connections/repositories/service-connection-repository", () => ({
    findServiceConnectionByType: vi.fn(),
}));

vi.mock("@/modules/service-connections/workflows/verify-configured-service-connection", () => ({
    verifyConfiguredServiceConnection: vi.fn(),
}));

vi.mock("@/modules/watch-history/queries/list-watch-history-context", () => ({
    listWatchHistoryContext: vi.fn(),
}));

vi.mock("@/modules/recommendations/repositories/recommendation-repository", () => ({
    completeRecommendationRun: vi.fn(),
    createQueuedRecommendationRun: vi.fn(),
    createRecommendationRun: vi.fn(),
    listRecommendationExclusionItems: vi.fn(),
    markRecommendationRunFailed: vi.fn(),
    upsertRecommendationRunMetrics: vi.fn(async () => undefined),
}));

vi.mock("@/modules/recommendations/queries/get-recommendation-taste-profile", () => ({
    getRecommendationTasteProfile: vi.fn(async () => ({
        likeCount: 0,
        dislikeCount: 0,
        hiddenCount: 0,
        addedCount: 0,
        likedItems: [],
        dislikedItems: [],
        addedItems: [],
        preferredGenres: [],
        avoidedGenres: [],
    })),
}));

vi.mock("@/modules/recommendations/adapters/openai-compatible-recommendations", () => ({
    generateOpenAiCompatibleRecommendations: vi.fn(),
}));

vi.mock("@/modules/service-connections/adapters/tmdb", () => ({
    lookupTmdbTitleDetails: vi.fn(),
}));

vi.mock("@/modules/users/repositories/user-repository", () => ({
    createAuditEvent: vi.fn(),
}));

vi.mock("@/modules/notifications/workflows/dispatch-notification", () => ({
    safeDispatchNotificationWorkflow: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/modules/media-library/queries/sample-library-taste", () => ({
    sampleLibraryTasteFromTitles: vi.fn(),
}));

import { getPreferencesByUserId } from "@/modules/preferences/repositories/preferences-repository";
import { generateOpenAiCompatibleRecommendations } from "@/modules/recommendations/adapters/openai-compatible-recommendations";
import {
    completeRecommendationRun,
    createQueuedRecommendationRun,
    createRecommendationRun,
    listRecommendationExclusionItems,
    markRecommendationRunFailed,
    upsertRecommendationRunMetrics,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { buildLibraryTasteItemKey } from "@/modules/recommendations/library-taste-key";
import { sampleLibraryTasteFromTitles } from "@/modules/media-library/queries/sample-library-taste";
import { lookupTmdbTitleDetails } from "@/modules/service-connections/adapters/tmdb";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { verifyConfiguredServiceConnection } from "@/modules/service-connections/workflows/verify-configured-service-connection";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";
import { listWatchHistoryContext } from "@/modules/watch-history/queries/list-watch-history-context";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import {
    createRecommendationRunWorkflow,
    enqueueRecommendationRunWorkflow,
} from "./create-recommendation-run";

const mockedGetPreferencesByUserId = vi.mocked(getPreferencesByUserId);
const mockedGenerateOpenAiCompatibleRecommendations = vi.mocked(
    generateOpenAiCompatibleRecommendations,
);
const mockedCompleteRecommendationRun = vi.mocked(completeRecommendationRun);
const mockedCreateQueuedRecommendationRun = vi.mocked(createQueuedRecommendationRun);
const mockedCreateRecommendationRun = vi.mocked(createRecommendationRun);
const mockedListRecommendationExclusionItems = vi.mocked(listRecommendationExclusionItems);
const mockedMarkRecommendationRunFailed = vi.mocked(markRecommendationRunFailed);
const mockedUpsertRecommendationRunMetrics = vi.mocked(upsertRecommendationRunMetrics);
const mockedListSampledLibraryItems = vi.mocked(sampleLibraryTasteFromTitles);
const mockedLookupTmdbTitleDetails = vi.mocked(lookupTmdbTitleDetails);
const mockedFindServiceConnectionByType = vi.mocked(findServiceConnectionByType);
const mockedVerifyConfiguredServiceConnection = vi.mocked(verifyConfiguredServiceConnection);
const mockedCreateAuditEvent = vi.mocked(createAuditEvent);
const mockedListWatchHistoryContext = vi.mocked(listWatchHistoryContext);
const mockedSafeDispatchNotificationWorkflow = vi.mocked(safeDispatchNotificationWorkflow);

function createConnectionRecord(serviceType: string, status: "configured" | "verified") {
    return {
        connection: {
            id: `${serviceType}-connection`,
            serviceType,
            ownershipScope: "user",
            ownerUserId: "user-1",
            displayName: serviceType,
            baseUrl: `http://${serviceType}.example`,
            status,
            statusMessage: status,
            metadataJson: null,
            lastVerifiedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        secret: {
            connectionId: `${serviceType}-connection`,
            encryptedValue: `encrypted-${serviceType}`,
            maskedValue: "***",
            createdAt: new Date(),
            updatedAt: new Date(),
        },
        metadata: null,
    } as Awaited<ReturnType<typeof findServiceConnectionByType>>;
}

describe("createRecommendationRunWorkflow", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockedGetPreferencesByUserId.mockResolvedValue({
            userId: "user-1",
            defaultMediaMode: "movies",
            defaultResultCount: 10,
            libraryTasteSampleSize: 150,
            defaultTemperature: 0.8,
            defaultAiModel: null,
            languagePreference: "any",
            watchHistoryOnly: false,
            watchHistorySourceTypes: [],
            historyHideExisting: false,
            historyHideLiked: false,
            historyHideDisliked: false,
            historyHideHidden: true,
            updatedAt: new Date(),
        });
        mockedCreateRecommendationRun.mockResolvedValue({ id: "run-1" } as never);
        mockedCreateQueuedRecommendationRun.mockResolvedValue({ id: "run-1" } as never);
        mockedCompleteRecommendationRun.mockResolvedValue(true);
        mockedMarkRecommendationRunFailed.mockResolvedValue(true);
        mockedListRecommendationExclusionItems.mockResolvedValue([]);
        mockedListWatchHistoryContext.mockResolvedValue([]);
        mockedListSampledLibraryItems.mockResolvedValue({
            totalCount: 0,
            sampledItems: [],
            normalizedKeys: [],
        });
        mockedVerifyConfiguredServiceConnection.mockResolvedValue({
            ok: true,
            message: "Verified",
        });
        mockedCreateAuditEvent.mockResolvedValue(undefined);
    });

    it("excludes library and prior recommendation duplicates from the prompt and results", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
        const generationCalls: Array<{ requestPrompt: string; requestedCount: number }> = [];
        const queuedResponses = [
            [
                {
                    title: "Arrival",
                    year: 2016,
                    rationale: "Already in the library.",
                    confidenceLabel: "high",
                    providerMetadata: {},
                },
                {
                    title: "Ex Machina",
                    year: 2014,
                    rationale: "Already recommended before.",
                    confidenceLabel: "medium",
                    providerMetadata: {},
                },
            ],
            [
                {
                    title: "Moon",
                    year: 2009,
                    rationale: "Fresh pick.",
                    confidenceLabel: "high",
                    providerMetadata: {},
                },
            ],
        ];

        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });
        mockedLookupTmdbTitleDetails.mockResolvedValue({ ok: false, message: "No match" });
        mockedListSampledLibraryItems.mockResolvedValue({
            totalCount: 1,
            sampledItems: [{ title: "Arrival", year: 2016, genres: [] }],
            normalizedKeys: [buildLibraryTasteItemKey({ title: "Arrival", year: 2016 })],
        });
        mockedListRecommendationExclusionItems.mockResolvedValue([
            { title: "Ex Machina", year: 2014 },
        ]);
        mockedGenerateOpenAiCompatibleRecommendations.mockImplementation(async (input) => {
            generationCalls.push({
                requestPrompt: input.requestPrompt,
                requestedCount: input.requestedCount,
            });

            return queuedResponses.shift() ?? [];
        });

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend cerebral sci-fi",
            selectedGenres: ["science-fiction", "comedy"],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedListSampledLibraryItems).toHaveBeenCalledWith(
            "user-1",
            "movie",
            expect.any(Number),
        );
        expect(mockedGenerateOpenAiCompatibleRecommendations).toHaveBeenCalledTimes(2);
        expect(mockedGenerateOpenAiCompatibleRecommendations).toHaveBeenNthCalledWith(
            1,
            expect.objectContaining({
                selectedGenres: ["science-fiction", "comedy"],
            }),
        );
        expect(generationCalls[1]?.requestPrompt).toContain("- Arrival (2016)");
        expect(generationCalls[1]?.requestPrompt).toContain("- Ex Machina (2014)");
        expect(mockedCompleteRecommendationRun).toHaveBeenCalledWith("run-1", [
            expect.objectContaining({
                mediaType: "movie",
                position: 1,
                title: "Moon",
                year: 2009,
            }),
        ]);
    });

    it("succeeds with a partial batch when backfill attempts are exhausted", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
        const queuedResponses = [
            [
                {
                    title: "Severance",
                    year: 2022,
                    rationale: "Fresh pick.",
                    confidenceLabel: "high",
                    providerMetadata: {},
                },
            ],
            [],
            [],
        ];

        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });
        mockedGenerateOpenAiCompatibleRecommendations.mockImplementation(async () => {
            return queuedResponses.shift() ?? [];
        });

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "tv",
            requestPrompt: "Recommend sharp prestige sci-fi",
            selectedGenres: ["science-fiction"],
            requestedCount: 3,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedCompleteRecommendationRun).toHaveBeenCalledWith("run-1", [
            expect.objectContaining({
                mediaType: "tv",
                position: 1,
                title: "Severance",
                year: 2022,
            }),
        ]);
        expect(mockedMarkRecommendationRunFailed).not.toHaveBeenCalled();
    });

    it("allows a request driven only by selected genres when no other taste context exists", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");

        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });
        mockedGenerateOpenAiCompatibleRecommendations.mockResolvedValue([
            {
                title: "Bottoms",
                year: 2023,
                rationale: "Genre-led pick.",
                confidenceLabel: "high",
                providerMetadata: {},
            },
        ]);

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "",
            selectedGenres: ["comedy"],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedGenerateOpenAiCompatibleRecommendations).toHaveBeenCalledWith(
            expect.objectContaining({
                selectedGenres: ["comedy"],
                languagePreference: "any",
            }),
        );
    });

    it("marks the run failed when strict language preference has no verified TMDB connection", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");

        mockedGetPreferencesByUserId.mockResolvedValue({
            userId: "user-1",
            defaultMediaMode: "movies",
            defaultResultCount: 10,
            libraryTasteSampleSize: 150,
            defaultTemperature: 0.8,
            defaultAiModel: null,
            languagePreference: "de",
            watchHistoryOnly: false,
            watchHistorySourceTypes: [],
            historyHideExisting: false,
            historyHideLiked: false,
            historyHideDisliked: false,
            historyHideHidden: true,
            updatedAt: new Date(),
        });
        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend German thrillers",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({
            ok: false,
            message:
                "Verify TMDB before requesting German recommendations. TMDB is required to strictly confirm each title's original language.",
        });

        if (result.ok) {
            throw new Error("Expected the workflow to fail when TMDB is unavailable.");
        }

        expect(mockedCreateRecommendationRun).toHaveBeenCalledTimes(1);
        expect(mockedMarkRecommendationRunFailed).toHaveBeenCalledWith("run-1", result.message);
        expect(mockedGenerateOpenAiCompatibleRecommendations).not.toHaveBeenCalled();

        const failedAudit = mockedCreateAuditEvent.mock.calls.find(
            ([input]) => input.eventType === "recommendations.run.failed",
        );
        const failedAuditPayload = JSON.parse(failedAudit?.[0]?.payloadJson ?? "{}");

        expect(failedAuditPayload.error).toEqual({ name: "Error" });
        expect(JSON.stringify(failedAuditPayload)).not.toContain(result.message);
    });

    it("filters generated items by TMDB original language before saving", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");
        const tmdbConnection = createConnectionRecord("tmdb", "verified");

        mockedGetPreferencesByUserId.mockResolvedValue({
            userId: "user-1",
            defaultMediaMode: "movies",
            defaultResultCount: 10,
            libraryTasteSampleSize: 150,
            defaultTemperature: 0.8,
            defaultAiModel: null,
            languagePreference: "de",
            watchHistoryOnly: false,
            watchHistorySourceTypes: [],
            historyHideExisting: false,
            historyHideLiked: false,
            historyHideDisliked: false,
            historyHideHidden: true,
            updatedAt: new Date(),
        });
        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            if (serviceType === "tmdb") {
                return tmdbConnection;
            }

            return null;
        });
        mockedGenerateOpenAiCompatibleRecommendations.mockResolvedValue([
            {
                title: "Dark",
                year: 2017,
                rationale: "German sci-fi mystery.",
                confidenceLabel: "high",
                providerMetadata: {},
            },
            {
                title: "Arrival",
                year: 2016,
                rationale: "English-language sci-fi.",
                confidenceLabel: "high",
                providerMetadata: {},
            },
        ]);
        mockedLookupTmdbTitleDetails.mockImplementation(async (input) => {
            if (input.title === "Dark") {
                return {
                    ok: true,
                    details: {
                        source: "tmdb",
                        tmdbId: 99,
                        mediaType: "movie",
                        title: "Dark",
                        originalTitle: "Dark",
                        overview: "German mystery.",
                        tagline: null,
                        year: 2017,
                        releaseDate: "2017-12-01",
                        originalLanguage: "de",
                        posterUrl: "https://image.test/dark.jpg",
                        backdropUrl: null,
                        genres: ["Mystery"],
                        runtimeMinutes: null,
                        seasonCount: null,
                        status: "Released",
                        voteAverage: 8,
                        voteCount: 100,
                        homepage: null,
                        imdbId: null,
                        tvdbId: null,
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
                    mediaType: "movie",
                    title: "Arrival",
                    originalTitle: "Arrival",
                    overview: "English sci-fi.",
                    tagline: null,
                    year: 2016,
                    releaseDate: "2016-11-11",
                    originalLanguage: "en",
                    posterUrl: null,
                    backdropUrl: null,
                    genres: ["Science Fiction"],
                    runtimeMinutes: 116,
                    seasonCount: null,
                    status: "Released",
                    voteAverage: 7.6,
                    voteCount: 1000,
                    homepage: null,
                    imdbId: "tt2543164",
                    tvdbId: null,
                    videos: [],
                    cast: [],
                    watchProviders: null,
                    similarTitles: [],
                },
            };
        });

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend German sci-fi",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedGenerateOpenAiCompatibleRecommendations).toHaveBeenCalledWith(
            expect.objectContaining({
                languagePreference: "de",
            }),
        );
        expect(mockedCompleteRecommendationRun).toHaveBeenCalledWith("run-1", [
            expect.objectContaining({
                title: "Dark",
                providerMetadataJson: expect.stringContaining('"originalLanguage":"de"'),
            }),
        ]);
        expect(JSON.stringify(mockedCompleteRecommendationRun.mock.calls[0]?.[1])).not.toContain(
            "Arrival",
        );
    });

    it("preserves success when post-commit metrics and audit recording fail", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");

        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });
        mockedGenerateOpenAiCompatibleRecommendations.mockResolvedValue([
            {
                title: "Moon",
                year: 2009,
                rationale: "Fresh pick.",
                confidenceLabel: "high",
                providerMetadata: {},
            },
        ]);
        mockedUpsertRecommendationRunMetrics.mockRejectedValue(new Error("metrics unavailable"));
        mockedCreateAuditEvent.mockRejectedValue(new Error("audit unavailable"));

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedCompleteRecommendationRun).toHaveBeenCalledTimes(1);
        expect(mockedMarkRecommendationRunFailed).not.toHaveBeenCalled();
    });

    it("does not rewrite metrics or audit when completion loses its pending guard", async () => {
        const aiProviderConnection = createConnectionRecord("ai-provider", "verified");

        mockedFindServiceConnectionByType.mockImplementation(async (_userId, serviceType) => {
            if (serviceType === "ai-provider") {
                return aiProviderConnection;
            }

            return null;
        });
        mockedGenerateOpenAiCompatibleRecommendations.mockResolvedValue([
            {
                title: "Moon",
                year: 2009,
                rationale: "Fresh pick.",
                confidenceLabel: "high",
                providerMetadata: {},
            },
        ]);
        mockedCompleteRecommendationRun.mockResolvedValue(false);

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedUpsertRecommendationRunMetrics).not.toHaveBeenCalled();
        expect(
            mockedCreateAuditEvent.mock.calls.filter(
                ([audit]) => audit.eventType === "recommendations.run.succeeded",
            ),
        ).toHaveLength(0);
    });

    it("keeps the committed run and job result when queued audit recording fails", async () => {
        mockedCreateAuditEvent.mockRejectedValue(new Error("audit unavailable"));

        const result = await enqueueRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({ ok: true, runId: "run-1" });
        expect(mockedCreateQueuedRecommendationRun).toHaveBeenCalledTimes(1);
        expect(mockedMarkRecommendationRunFailed).not.toHaveBeenCalled();
    });

    it("returns a generic error when atomic run and job creation fails", async () => {
        mockedCreateQueuedRecommendationRun.mockRejectedValue(new Error("job store unavailable"));

        const result = await enqueueRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result).toEqual({
            ok: false,
            message: "Unable to queue the recommendation run. Try again.",
        });
        expect(mockedCreateQueuedRecommendationRun).toHaveBeenCalledWith({
            userId: "user-1",
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            aiTemperature: 0.6,
            watchHistoryOnly: false,
        });
        expect(mockedMarkRecommendationRunFailed).not.toHaveBeenCalled();
    });

    it("does not record failed metrics or audit after a lost pending guard race", async () => {
        mockedMarkRecommendationRunFailed.mockResolvedValue(false);
        mockedGenerateOpenAiCompatibleRecommendations.mockRejectedValue(
            new Error("generation failed"),
        );

        const result = await createRecommendationRunWorkflow("user-1", {
            mediaType: "movie",
            requestPrompt: "Recommend a thoughtful science-fiction movie",
            selectedGenres: [],
            requestedCount: 1,
            aiModel: "deepseek/deepseek-v4-pro",
            temperature: 0.6,
        });

        expect(result.ok).toBe(false);
        expect(mockedUpsertRecommendationRunMetrics).not.toHaveBeenCalled();
        expect(
            mockedCreateAuditEvent.mock.calls.filter(
                ([audit]) => audit.eventType === "recommendations.run.failed",
            ),
        ).toHaveLength(0);
        expect(
            mockedSafeDispatchNotificationWorkflow.mock.calls.filter(
                ([notification]) => notification.payload.eventType === "recommendation_run_failed",
            ),
        ).toHaveLength(0);
    });
});
