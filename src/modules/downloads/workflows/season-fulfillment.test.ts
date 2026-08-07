import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    countDownloadFulfillmentAttempts: vi.fn(),
    createOrGetOpenSeasonFulfillment: vi.fn(),
    findActiveDownloadRequestForFulfillment: vi.fn(),
    findDownloadFulfillmentById: vi.fn(),
    findOpenSeasonFulfillment: vi.fn(),
    listDownloadFulfillmentEpisodes: vi.fn(),
    listDueDownloadFulfillments: vi.fn(),
    listFulfillmentReleaseExclusions: vi.fn(),
    updateDownloadFulfillment: vi.fn(),
    updateDownloadFulfillmentEpisode: vi.fn(),
    upsertDownloadFulfillmentEpisode: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    findActiveDownloadRequestForItem: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    findTvEpisodeByIdForUser: vi.fn(),
    listTvEpisodesForSeasonForUser: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-library-item-releases", () => ({
    searchLibraryItemReleasesWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/repositories/media-request-attempts-repository", () => ({
    acquireMediaRequestAttempt: vi.fn(),
    FULL_SEASON_REQUEST_ATTEMPT_TTL_MS: 7_200_000,
    releaseMediaRequestAttempt: vi.fn(),
    renewMediaRequestAttempt: vi.fn(),
}));

import {
    countDownloadFulfillmentAttempts,
    createOrGetOpenSeasonFulfillment,
    findActiveDownloadRequestForFulfillment,
    findDownloadFulfillmentById,
    findOpenSeasonFulfillment,
    listDownloadFulfillmentEpisodes,
    listDueDownloadFulfillments,
    listFulfillmentReleaseExclusions,
    updateDownloadFulfillment,
    updateDownloadFulfillmentEpisode,
    upsertDownloadFulfillmentEpisode,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";
import {
    findTvEpisodeByIdForUser,
    listTvEpisodesForSeasonForUser,
} from "@/modules/media-library/repositories/media-library-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";
import { queueLibraryItemRelease } from "@/modules/media-library/workflows/search-library-item-releases/release-queueing";
import {
    acquireMediaRequestAttempt,
    releaseMediaRequestAttempt,
    renewMediaRequestAttempt,
} from "@/modules/media-library/repositories/media-request-attempts-repository";

import {
    attemptSeasonPack,
    createSeasonFulfillment,
    markFulfillmentEpisodeFailedAndRetry,
    markSeasonPackFailedAndRecover,
    queueMissingSeasonEpisodes,
    reconcileSeasonCoverage,
    recordSeasonPackSubmissionOutcome,
    runDueSeasonFulfillments,
} from "./season-fulfillment";

const countAttemptsMock = vi.mocked(countDownloadFulfillmentAttempts);
const createFulfillmentMock = vi.mocked(createOrGetOpenSeasonFulfillment);
const findActivePackMock = vi.mocked(findActiveDownloadRequestForFulfillment);
const findFulfillmentMock = vi.mocked(findDownloadFulfillmentById);
const findOpenFulfillmentMock = vi.mocked(findOpenSeasonFulfillment);
const listEpisodeStatesMock = vi.mocked(listDownloadFulfillmentEpisodes);
const listDueMock = vi.mocked(listDueDownloadFulfillments);
const listExclusionsMock = vi.mocked(listFulfillmentReleaseExclusions);
const updateFulfillmentMock = vi.mocked(updateDownloadFulfillment);
const updateEpisodeMock = vi.mocked(updateDownloadFulfillmentEpisode);
const upsertEpisodeMock = vi.mocked(upsertDownloadFulfillmentEpisode);
const findActiveItemMock = vi.mocked(findActiveDownloadRequestForItem);
const findEpisodeMock = vi.mocked(findTvEpisodeByIdForUser);
const listEpisodesMock = vi.mocked(listTvEpisodesForSeasonForUser);
const searchMock = vi.mocked(searchLibraryItemReleasesWorkflow);
const acquireMock = vi.mocked(acquireMediaRequestAttempt);
const releaseMock = vi.mocked(releaseMediaRequestAttempt);
const renewMock = vi.mocked(renewMediaRequestAttempt);
const attemptLease = {
    id: "lease-1",
    userId: "user-1",
    requestKey: "season-fulfillment:fulfillment-1:work",
    expiresAt: new Date("2026-07-15T12:30:00Z"),
};

type MockFulfillment = {
    id: string;
    userId: string;
    mediaTitleId: string;
    seasonId: string;
    requestedTitle: string;
    targetLibraryPathId: string | null;
    strategy: "season_pack" | "episodes";
    status: "active" | "partial" | "retry_wait" | "blocked" | "failed" | "cancelled" | "succeeded";
    packAttemptCount: number;
    packAttemptLimit: number;
    nextAttemptAt: Date | null;
    cancellationRequestedAt: Date | null;
    statusMessage: string | null;
    completedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

type MockEpisodeState = {
    fulfillmentId: string;
    episodeId: string;
    status:
        "pending" | "active" | "retry_wait" | "unavailable" | "blocked" | "succeeded" | "deferred";
    attemptCount: number;
    nextAttemptAt: Date | null;
    statusMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
};

const fixedNow = new Date("2026-07-15T18:00:00.000Z");
const transientCapacity = {
    availableBytes: 10_000,
    filesystemCapacityBytes: 100_000,
    requiredBytes: 20_000,
    activeReservationBytes: 12_000,
    activeRemainingBytes: 5_000,
    activeDownloadedBytes: 2_000,
};
const permanentCapacity = {
    availableBytes: 10_000,
    filesystemCapacityBytes: 20_000,
    requiredBytes: 30_000,
    activeReservationBytes: 5_000,
    activeRemainingBytes: 2_000,
    activeDownloadedBytes: 1_000,
};
const storageCapacity = {
    availableBytes: 10_000,
    filesystemCapacityBytes: 100_000,
    requiredBytes: 30_000,
    activeReservationBytes: 5_000,
    activeRemainingBytes: 2_000,
    activeDownloadedBytes: 1_000,
};
let fulfillment: MockFulfillment;
let episodeStates: MockEpisodeState[];

function makeFulfillment(overrides: Partial<MockFulfillment> = {}): MockFulfillment {
    return {
        id: "fulfillment-1",
        userId: "user-1",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        requestedTitle: "Severance Season 1",
        targetLibraryPathId: "path-1",
        strategy: "season_pack",
        status: "active",
        packAttemptCount: 0,
        packAttemptLimit: 3,
        nextAttemptAt: fixedNow,
        cancellationRequestedAt: null,
        statusMessage: "Searching for a complete season pack.",
        completedAt: null,
        createdAt: fixedNow,
        updatedAt: fixedNow,
        ...overrides,
    };
}

function makeEpisode(id: string, episodeNumber: number, overrides: Record<string, unknown> = {}) {
    return {
        id,
        titleId: "title-1",
        seasonId: "season-1",
        seasonNumber: 1,
        episodeNumber,
        title: `Episode ${episodeNumber}`,
        airDate: "2026-07-01",
        monitored: true,
        hasFile: false,
        createdAt: fixedNow,
        updatedAt: fixedNow,
        ...overrides,
    };
}

function queuedSearchResult() {
    return {
        queuedDownload: { queued: true, reason: "queued", message: null },
    } as never;
}

function noMatchingReleaseResult() {
    return {
        queuedDownload: {
            queued: false,
            reason: "no_matching_release",
            message: "No matching release was found.",
        },
    } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);

    fulfillment = makeFulfillment();
    episodeStates = [];

    findFulfillmentMock.mockImplementation(async (userId, fulfillmentId) =>
        userId === fulfillment.userId && fulfillmentId === fulfillment.id
            ? ({ ...fulfillment } as never)
            : null,
    );
    updateFulfillmentMock.mockImplementation(async (input) => {
        if (input.userId !== fulfillment.userId || input.fulfillmentId !== fulfillment.id) {
            return null;
        }

        if (input.expectedStatuses && !input.expectedStatuses.includes(fulfillment.status)) {
            return null;
        }

        if ("expectedCancellationRequestedAt" in input) {
            const expectedTime = input.expectedCancellationRequestedAt?.getTime() ?? null;
            const currentTime = fulfillment.cancellationRequestedAt?.getTime() ?? null;

            if (expectedTime !== currentTime) {
                return null;
            }
        }

        const update: Partial<MockFulfillment> = {};

        if (input.strategy !== undefined) {
            update.strategy = input.strategy;
        }

        if (input.status !== undefined) {
            update.status = input.status;
        }

        if (input.packAttemptCount !== undefined) {
            update.packAttemptCount = input.packAttemptCount;
        }

        if (input.nextAttemptAt !== undefined) {
            update.nextAttemptAt = input.nextAttemptAt;
        }

        if (input.cancellationRequestedAt !== undefined) {
            update.cancellationRequestedAt = input.cancellationRequestedAt;
        }

        if (input.statusMessage !== undefined) {
            update.statusMessage = input.statusMessage;
        }

        if (input.completedAt !== undefined) {
            update.completedAt = input.completedAt;
        }

        fulfillment = {
            ...fulfillment,
            ...update,
            updatedAt: new Date(),
        } as MockFulfillment;

        return { ...fulfillment } as never;
    });
    listEpisodeStatesMock.mockImplementation(async (input) =>
        input.userId === fulfillment.userId && input.fulfillmentId === fulfillment.id
            ? (episodeStates.map((state) => ({ ...state })) as never)
            : [],
    );
    upsertEpisodeMock.mockImplementation(async (input) => {
        const existing = episodeStates.find((state) => state.episodeId === input.episodeId);
        const next: MockEpisodeState = {
            fulfillmentId: input.fulfillmentId,
            episodeId: input.episodeId,
            status: input.status,
            attemptCount: input.attemptCount ?? existing?.attemptCount ?? 0,
            nextAttemptAt:
                input.nextAttemptAt === undefined
                    ? (existing?.nextAttemptAt ?? null)
                    : input.nextAttemptAt,
            statusMessage:
                input.statusMessage === undefined
                    ? (existing?.statusMessage ?? null)
                    : input.statusMessage,
            createdAt: existing?.createdAt ?? new Date(),
            updatedAt: new Date(),
        };

        if (existing) {
            Object.assign(existing, next);
        } else {
            episodeStates.push(next);
        }

        return { ...next } as never;
    });
    updateEpisodeMock.mockImplementation(async (input) => {
        const existing = episodeStates.find((state) => state.episodeId === input.episodeId);

        if (!existing) {
            return null;
        }

        Object.assign(existing, input, { updatedAt: new Date() });

        return { ...existing } as never;
    });

    countAttemptsMock.mockResolvedValue(0);
    findActivePackMock.mockResolvedValue(null);
    findOpenFulfillmentMock.mockResolvedValue(null);
    findActiveItemMock.mockResolvedValue(null);
    listDueMock.mockResolvedValue([]);
    listExclusionsMock.mockResolvedValue({ resultIds: [], releaseKeys: [] });
    listEpisodesMock.mockResolvedValue([]);
    searchMock.mockResolvedValue(queuedSearchResult());
    acquireMock.mockImplementation(async (userId, requestKey, ttlMs) => ({
        id: `lease:${requestKey}`,
        userId,
        requestKey,
        expiresAt: new Date(Date.now() + (ttlMs ?? 300_000)),
    }));
    renewMock.mockImplementation(async (lease) => ({
        ...lease,
        expiresAt: new Date(Date.now() + 900_000),
    }));
    releaseMock.mockResolvedValue(true);
    findEpisodeMock.mockImplementation(
        async (_userId, episodeId) =>
            ({
                title: { id: "title-1" },
                episode: makeEpisode(
                    episodeId,
                    Number.parseInt(episodeId.match(/\d+$/)?.[0] ?? "1", 10),
                ),
            }) as never,
    );
});

afterEach(() => {
    vi.useRealTimers();
});

describe("season fulfillment recovery", () => {
    it("refunds the episode attempt slot when the failed attempt transferred nothing", async () => {
        fulfillment = makeFulfillment({ strategy: "episodes" });
        episodeStates.push({
            fulfillmentId: fulfillment.id,
            episodeId: "episode-1",
            status: "active",
            // The budget looks exhausted, but the last slot was consumed by a
            // zero-transfer abandon that is now being refunded.
            attemptCount: 3,
            nextAttemptAt: null,
            statusMessage: null,
            createdAt: fixedNow,
            updatedAt: fixedNow,
        });

        const queued = await markFulfillmentEpisodeFailedAndRetry({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            episode: makeEpisode("episode-1", 1) as never,
            failureMessage: "The transfer stopped early: the release cannot assemble completely.",
            attemptWasFree: true,
        });

        expect(queued).toBe(true);
        expect(searchMock).toHaveBeenCalled();
        expect(episodeStates[0].status).not.toBe("unavailable");
    });

    it("keeps the episode exhaustion stop when the failed attempt consumed budget", async () => {
        fulfillment = makeFulfillment({ strategy: "episodes" });
        episodeStates.push({
            fulfillmentId: fulfillment.id,
            episodeId: "episode-1",
            status: "active",
            attemptCount: 3,
            nextAttemptAt: null,
            statusMessage: null,
            createdAt: fixedNow,
            updatedAt: fixedNow,
        });

        const queued = await markFulfillmentEpisodeFailedAndRetry({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            episode: makeEpisode("episode-1", 1) as never,
            failureMessage: "PAR2 repair failed after the transfer completed.",
        });

        expect(queued).toBe(false);
        expect(searchMock).not.toHaveBeenCalled();
        expect(episodeStates[0].status).toBe("unavailable");
    });

    it("creates a restart-safe checkpoint before the initial pack search", async () => {
        createFulfillmentMock.mockResolvedValue(fulfillment as never);

        await createSeasonFulfillment({
            userId: "user-1",
            mediaTitleId: "title-1",
            seasonId: "season-1",
            requestedTitle: "Severance Season 1",
            targetLibraryPathId: "path-1",
        });

        expect(createFulfillmentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                status: "active",
                strategy: "season_pack",
                nextAttemptAt: new Date("2026-07-15T18:15:00.000Z"),
            }),
        );
    });

    it("falls back from no season pack and queues every eligible missing aired episode", async () => {
        const episodes = [makeEpisode("episode-1", 1), makeEpisode("episode-2", 2)];

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(0);
        searchMock.mockImplementation(async (_userId, input) =>
            input.seasonId ? noMatchingReleaseResult() : queuedSearchResult(),
        );

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.releaseSearch?.queuedDownload).toMatchObject({
            queued: false,
            reason: "no_matching_release",
        });
        expect(result.fallback).toMatchObject({
            episodeCount: 2,
            activeCount: 2,
            queuedCount: 2,
            blockedCount: 0,
        });
        expect(searchMock).toHaveBeenCalledTimes(3);
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                titleId: "title-1",
                seasonId: "season-1",
                excludedResultIds: [],
                excludedReleaseKeys: [],
            }),
            {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 1,
                maxCandidateAttempts: 3,
                workLease: expect.objectContaining({
                    requestKey: "season-fulfillment:fulfillment-1:work",
                }),
            },
        );
        expect(
            searchMock.mock.calls.slice(1).map(([, input, context]) => ({ input, context })),
        ).toEqual(
            expect.arrayContaining(
                episodes.map((episode) => ({
                    input: {
                        titleId: "title-1",
                        episodeId: episode.id,
                        targetLibraryPathId: "path-1",
                        excludedResultIds: [],
                        excludedReleaseKeys: [],
                    },
                    context: {
                        fulfillmentId: "fulfillment-1",
                        attemptStrategy: "episode",
                        attemptNumber: 1,
                        maxCandidateAttempts: 3,
                        workLease: expect.objectContaining({
                            requestKey: "season-fulfillment:fulfillment-1:work",
                        }),
                    },
                })),
            ),
        );
        expect(fulfillment).toMatchObject({ strategy: "episodes", status: "active" });
    });

    it("skips owned, future, unmonitored, and already-active episodes", async () => {
        const episodes = [
            makeEpisode("owned", 1, { hasFile: true }),
            makeEpisode("future", 2, { airDate: "2026-08-01" }),
            makeEpisode("unmonitored", 3, { monitored: false }),
            makeEpisode("already-active", 4),
            makeEpisode("eligible", 5),
        ];

        listEpisodesMock.mockResolvedValue(episodes as never);
        findActiveItemMock.mockImplementation(async (input) =>
            input.episodeId === "already-active" ? ({ id: "request-active" } as never) : null,
        );
        countAttemptsMock.mockResolvedValue(1);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was found.",
        });

        expect(result).toMatchObject({
            episodeCount: 5,
            ownedCount: 1,
            deferredCount: 2,
            activeCount: 2,
            queuedCount: 1,
        });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ episodeId: "eligible" }),
            expect.objectContaining({ attemptStrategy: "episode" }),
        );
        expect(
            Object.fromEntries(episodeStates.map((state) => [state.episodeId, state.status])),
        ).toEqual({
            owned: "succeeded",
            future: "deferred",
            unmonitored: "deferred",
            "already-active": "active",
            eligible: "active",
        });
        expect(episodeStates.find((state) => state.episodeId === "future")?.nextAttemptAt).toEqual(
            new Date("2026-08-01T00:00:00.000Z"),
        );
        expect(
            episodeStates.find((state) => state.episodeId === "unmonitored")?.nextAttemptAt,
        ).toBeNull();
    });

    it("keeps future monitored episodes scheduled instead of closing the season plan", async () => {
        const episodes = [
            makeEpisode("owned", 1, { hasFile: true }),
            makeEpisode("future", 2, { airDate: "2026-08-01" }),
            makeEpisode("unmonitored", 3, { monitored: false }),
        ];

        listEpisodesMock.mockResolvedValue(episodes as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was found.",
        });

        expect(result).toMatchObject({
            completed: false,
            ownedCount: 1,
            deferredCount: 2,
        });
        expect(fulfillment).toMatchObject({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-08-01T00:00:00.000Z"),
            completedAt: null,
        });
        expect(searchMock).not.toHaveBeenCalled();
    });

    it("automatically searches a deferred monitored episode after its air date", async () => {
        vi.setSystemTime(new Date("2026-08-02T18:00:00.000Z"));
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-08-01T00:00:00.000Z"),
        });
        const episode = makeEpisode("episode-2", 2, { airDate: "2026-08-01" });

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: episode.id,
                status: "deferred",
                attemptCount: 0,
                nextAttemptAt: new Date("2026-08-01T00:00:00.000Z"),
                statusMessage: "S01E02 is future or no longer monitored.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([episode] as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "The episode air date arrived.",
        });

        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ episodeId: episode.id }),
            expect.objectContaining({
                attemptStrategy: "episode",
                maxCandidateAttempts: 3,
            }),
        );
        expect(result).toMatchObject({
            activeCount: 1,
            queuedCount: 1,
            completed: false,
        });
    });

    it("starts a fresh bounded candidate cycle after an unavailable episode cooldown", async () => {
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
        });
        const episode = makeEpisode("episode-cooldown", 1);

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: episode.id,
                status: "unavailable",
                attemptCount: 3,
                nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
                statusMessage: "Automatic alternatives are exhausted for now.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([episode] as never);
        listExclusionsMock.mockResolvedValue({
            resultIds: ["old-result-1", "old-result-2", "old-result-3"],
            releaseKeys: ["guid:old-1", "guid:old-2", "guid:old-3"],
        });
        countAttemptsMock.mockResolvedValueOnce(3).mockResolvedValueOnce(4);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "The episode release cooldown elapsed.",
        });

        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                episodeId: episode.id,
                excludedResultIds: ["old-result-1", "old-result-2", "old-result-3"],
                excludedReleaseKeys: ["guid:old-1", "guid:old-2", "guid:old-3"],
            }),
            expect.objectContaining({
                attemptStrategy: "episode",
                attemptNumber: 4,
                maxCandidateAttempts: 3,
            }),
        );
        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: episode.id,
                status: "active",
                attemptCount: 1,
            }),
        );
        expect(result).toMatchObject({ activeCount: 1, queuedCount: 1 });
    });

    it("retries a missed episode in minutes while its candidate budget remains", async () => {
        fulfillment = makeFulfillment({ strategy: "episodes" });
        const episode = makeEpisode("episode-missed", 1);

        listEpisodesMock.mockResolvedValue([episode] as never);
        searchMock.mockResolvedValue(noMatchingReleaseResult());

        await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "No season pack was usable.",
        });

        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: episode.id,
                status: "retry_wait",
                attemptCount: 0,
                nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
            }),
        );
    });

    it("keeps the long release cooldown once the episode candidate budget is spent", async () => {
        fulfillment = makeFulfillment({ strategy: "episodes" });
        const episode = makeEpisode("episode-spent", 1);

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: episode.id,
                status: "retry_wait",
                attemptCount: 3,
                nextAttemptAt: fixedNow,
                statusMessage: "No matching episode release is available yet.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([episode] as never);
        searchMock.mockResolvedValue(noMatchingReleaseResult());

        await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "Resuming automatic season recovery.",
        });

        expect(searchMock).not.toHaveBeenCalled();
        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: episode.id,
                status: "unavailable",
                nextAttemptAt: new Date("2026-07-16T00:00:00.000Z"),
            }),
        );
    });

    it("starts a fresh bounded candidate cycle when a blocked season is resumed manually", async () => {
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "blocked",
            nextAttemptAt: null,
        });
        const episode = makeEpisode("episode-manual", 1);

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: episode.id,
                status: "unavailable",
                attemptCount: 3,
                nextAttemptAt: new Date("2026-07-16T00:00:00.000Z"),
                statusMessage: "No new release is available yet.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([episode] as never);
        listExclusionsMock.mockResolvedValue({
            resultIds: ["old-result-1", "old-result-2", "old-result-3"],
            releaseKeys: ["title:old-1", "title:old-2", "title:old-3"],
        });
        countAttemptsMock.mockResolvedValueOnce(3).mockResolvedValueOnce(4);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "The user resumed season recovery.",
            force: true,
        });

        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                episodeId: episode.id,
                excludedResultIds: ["old-result-1", "old-result-2", "old-result-3"],
                excludedReleaseKeys: ["title:old-1", "title:old-2", "title:old-3"],
            }),
            expect.objectContaining({
                attemptStrategy: "episode",
                attemptNumber: 4,
                maxCandidateAttempts: 3,
            }),
        );
        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: episode.id,
                status: "active",
                attemptCount: 1,
            }),
        );
        expect(result).toMatchObject({ activeCount: 1, queuedCount: 1 });
    });

    it("spends only the remaining budget while continuing the same episode recovery cycle", async () => {
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
        });
        const episode = makeEpisode("episode-retry", 1);

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: episode.id,
                status: "retry_wait",
                attemptCount: 2,
                nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
                statusMessage: "Trying another release shortly.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([episode] as never);
        listExclusionsMock.mockResolvedValue({
            resultIds: ["old-result-1", "old-result-2", "old-result-3", "old-result-4"],
            releaseKeys: [],
        });
        countAttemptsMock.mockResolvedValueOnce(4).mockResolvedValueOnce(5);

        await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "Continuing automatic episode recovery.",
        });

        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({
                episodeId: episode.id,
                excludedResultIds: ["old-result-1", "old-result-2", "old-result-3", "old-result-4"],
            }),
            expect.objectContaining({
                attemptNumber: 5,
                maxCandidateAttempts: 1,
            }),
        );
        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: episode.id,
                status: "active",
                attemptCount: 3,
            }),
        );
    });

    it("pauses a mixed blocked and unavailable episode plan so it exposes a resume action", async () => {
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-07-16T00:00:00.000Z"),
        });
        const blocked = makeEpisode("episode-blocked", 1);
        const unavailable = makeEpisode("episode-unavailable", 2);

        episodeStates = [
            {
                fulfillmentId: fulfillment.id,
                episodeId: blocked.id,
                status: "blocked",
                attemptCount: 1,
                nextAttemptAt: null,
                statusMessage: "The downloader needs attention.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
            {
                fulfillmentId: fulfillment.id,
                episodeId: unavailable.id,
                status: "unavailable",
                attemptCount: 3,
                nextAttemptAt: new Date("2026-07-16T00:00:00.000Z"),
                statusMessage: "No new release is available yet.",
                createdAt: fixedNow,
                updatedAt: fixedNow,
            },
        ];
        listEpisodesMock.mockResolvedValue([blocked, unavailable] as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: fulfillment.id,
            reason: "Reconciling the individual episode plan.",
        });

        expect(searchMock).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            blockedCount: 1,
            unavailableCount: 1,
            activeCount: 0,
            retryWaitCount: 0,
        });
        expect(fulfillment).toMatchObject({
            status: "blocked",
            nextAttemptAt: null,
            statusMessage: expect.stringMatching(/1 awaiting a release, 1 blocked/),
        });
    });

    it("blocks on an infrastructure queue failure without fanning out to episodes", async () => {
        countAttemptsMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: true,
                message: "The download path is unavailable.",
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fallback).toBeNull();
        expect(result.fulfillment).toMatchObject({
            status: "blocked",
            nextAttemptAt: null,
            statusMessage: "The download path is unavailable.",
        });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(listEpisodesMock).not.toHaveBeenCalled();
        expect(upsertEpisodeMock).not.toHaveBeenCalled();
    });

    // `blocked` has no due timestamp, so listDueDownloadFulfillments can never
    // pick the plan up again — a provider hiccup must not end automatic recovery.
    it("retries a season pack after a transient downloader failure instead of blocking", async () => {
        countAttemptsMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: false,
                message: "Nooklet could not queue the selected release: fetch failed",
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fulfillment).toMatchObject({
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
        });
    });

    it("parks a season pack once the transient backoff reaches its ceiling", async () => {
        countAttemptsMock.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
        // The gap already scheduled between the last write and its next attempt is
        // how the backoff records elapsed failure; at the ceiling a human is due.
        fulfillment.nextAttemptAt = new Date(fulfillment.updatedAt.getTime() + 6 * 60 * 60 * 1000);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: false,
                message: "Nooklet could not queue the selected release: fetch failed",
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fulfillment).toMatchObject({ status: "blocked", nextAttemptAt: null });
    });

    it("reschedules untouched episodes after a transient failure rather than blocking them", async () => {
        const episodes = Array.from({ length: 6 }, (_, index) =>
            makeEpisode(`episode-${index + 1}`, index + 1),
        );

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(1);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: false,
                message: "Nooklet could not queue the selected release: fetch failed",
            },
        } as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        // The fan-out still short-circuits so a failing downloader is not hammered
        // once per episode, but nothing is parked.
        expect(searchMock.mock.calls.length).toBeLessThanOrEqual(3);
        expect(result).toMatchObject({ episodeCount: 6, blockedCount: 0, queuedCount: 0 });
        expect(result.retryWaitCount).toBe(6);
    });

    it("defers a season pack when workspace capacity is temporarily reserved", async () => {
        countAttemptsMock.mockResolvedValue(0);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "capacity",
                capacity: transientCapacity,
                message: "The active queue currently reserves the available workspace.",
                rejectedResultIds: [],
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fallback).toBeNull();
        expect(result.fulfillment).toMatchObject({
            status: "retry_wait",
            packAttemptCount: 0,
            nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
            statusMessage: expect.stringMatching(/workspace capacity.*retry automatically/i),
        });
        expect(listEpisodesMock).not.toHaveBeenCalled();
    });

    it("persists the initial capacity failure as a retry checkpoint", async () => {
        countAttemptsMock.mockResolvedValue(0);

        await recordSeasonPackSubmissionOutcome({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            outcome: {
                queued: false,
                reason: "queue_failed",
                failureKind: "capacity",
                capacity: transientCapacity,
                message: "The active queue currently reserves the available workspace.",
            },
        });

        expect(fulfillment).toMatchObject({
            status: "retry_wait",
            packAttemptCount: 0,
            nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
            statusMessage: expect.stringMatching(/workspace capacity.*retry automatically/i),
        });
    });

    it("backs off repeated active-reservation capacity contention exponentially", async () => {
        fulfillment = makeFulfillment({
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-15T17:55:00.000Z"),
            updatedAt: new Date("2026-07-15T17:50:00.000Z"),
            statusMessage: "Season recovery is waiting for download workspace capacity.",
        });
        countAttemptsMock.mockResolvedValue(0);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "capacity",
                capacity: transientCapacity,
                message: "Active downloads still reserve the workspace.",
                rejectedResultIds: [],
            },
        } as never);

        await attemptSeasonPack("user-1", "fulfillment-1");

        expect(fulfillment).toMatchObject({
            status: "retry_wait",
            packAttemptCount: 0,
            nextAttemptAt: new Date("2026-07-15T18:10:00.000Z"),
        });
    });

    it("falls back to episodes when a season release cannot fit without active reservations", async () => {
        const episodes = [makeEpisode("episode-1", 1)];

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(1);
        searchMock.mockImplementation(async (_userId, input) =>
            input.seasonId
                ? ({
                      queuedDownload: {
                          queued: false,
                          reason: "queue_failed",
                          failureKind: "release",
                          capacity: permanentCapacity,
                          message: "The season pack is too large for this workspace.",
                          rejectedResultIds: ["oversized-season-pack"],
                      },
                  } as never)
                : queuedSearchResult(),
        );

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.releaseSearch?.queuedDownload).toMatchObject({
            failureKind: "release",
            capacity: permanentCapacity,
            rejectedResultIds: ["oversized-season-pack"],
        });
        expect(result.fallback).toMatchObject({
            episodeCount: 1,
            queuedCount: 1,
            activeCount: 1,
        });
        expect(fulfillment).toMatchObject({
            strategy: "episodes",
            status: "active",
        });
    });

    it("blocks for repair without consuming the pack when the staging volume is full", async () => {
        countAttemptsMock.mockResolvedValue(0);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: true,
                capacity: storageCapacity,
                message:
                    "Active downloads do not account for this shortage. Free space in the configured download workspace or correct its drive/volume mapping, then resume.",
                rejectedResultIds: [],
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fallback).toBeNull();
        expect(result.fulfillment).toMatchObject({
            status: "blocked",
            packAttemptCount: 0,
            nextAttemptAt: null,
            statusMessage: expect.stringMatching(/drive\/volume mapping.*resume/i),
        });
        expect(listEpisodesMock).not.toHaveBeenCalled();
    });

    it("blocks a season when the actual failed search reports no enabled Newznab indexers", async () => {
        const queuedDownload = await queueLibraryItemRelease(
            "user-1",
            {
                title: {
                    id: "title-1",
                    libraryId: "library-1",
                    mediaType: "tv",
                    title: "Severance",
                    year: 2022,
                    qualityProfile: "hd-1080p",
                },
                season: {
                    id: "season-1",
                    seasonNumber: 1,
                },
                episode: null,
                targetLibraryPathId: "path-1",
            } as never,
            {
                searched: true,
                query: "Severance S01",
                searchRun: {
                    status: "failed",
                    errorMessage: "No enabled Newznab indexers were available for this search.",
                },
                results: [],
            } as never,
        );

        expect(queuedDownload).toMatchObject({
            queued: false,
            reason: "search_failed",
            failureKind: "infrastructure",
        });

        await recordSeasonPackSubmissionOutcome({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            outcome: queuedDownload,
        });

        expect(fulfillment).toMatchObject({
            status: "blocked",
            nextAttemptAt: null,
            statusMessage: "No enabled Newznab indexers were available for this search.",
        });
    });

    it("stops episode fan-out after an infrastructure failure and blocks untouched children", async () => {
        const episodes = Array.from({ length: 6 }, (_, index) =>
            makeEpisode(`episode-${index + 1}`, index + 1),
        );

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(1);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "infrastructure",
                terminalFailure: true,
                capacity: storageCapacity,
                message:
                    "The configured download workspace or drive/volume mapping needs attention.",
            },
        } as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        expect(searchMock.mock.calls.length).toBeGreaterThan(0);
        expect(searchMock.mock.calls.length).toBeLessThanOrEqual(3);
        expect(result).toMatchObject({
            episodeCount: 6,
            blockedCount: 6,
            queuedCount: 0,
        });
        expect(fulfillment).toMatchObject({ status: "blocked", nextAttemptAt: null });
    });

    it("keeps capacity-limited episode children retryable without consuming attempts", async () => {
        const episodes = [makeEpisode("episode-1", 1), makeEpisode("episode-2", 2)];

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(0);
        searchMock.mockImplementation(async (_userId, input) =>
            input.episodeId === "episode-1"
                ? queuedSearchResult()
                : ({
                      queuedDownload: {
                          queued: false,
                          reason: "queue_failed",
                          failureKind: "capacity",
                          capacity: transientCapacity,
                          message: "The active queue currently reserves the available workspace.",
                          rejectedResultIds: [],
                      },
                  } as never),
        );

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        expect(result).toMatchObject({
            activeCount: 1,
            retryWaitCount: 1,
            blockedCount: 0,
            queuedCount: 1,
        });
        expect(episodeStates).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    episodeId: "episode-1",
                    status: "active",
                }),
                expect.objectContaining({
                    episodeId: "episode-2",
                    status: "retry_wait",
                    attemptCount: 0,
                    nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
                }),
            ]),
        );
        expect(fulfillment).toMatchObject({
            status: "active",
            nextAttemptAt: new Date("2026-07-15T18:05:00.000Z"),
        });
    });

    it("rechecks missing episode metadata instead of permanently blocking the season", async () => {
        listEpisodesMock.mockResolvedValue([]);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        expect(result).toMatchObject({ retryWaitCount: 1, blockedCount: 0 });
        expect(fulfillment).toMatchObject({
            strategy: "episodes",
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-16T00:00:00.000Z"),
        });
    });

    it("backs off repeated transient indexer failures", async () => {
        fulfillment = makeFulfillment({
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-15T17:55:00.000Z"),
            updatedAt: new Date("2026-07-15T17:50:00.000Z"),
        });
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "search_failed",
                failureKind: "unknown",
                message: "The indexer timed out.",
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fallback).toBeNull();
        expect(fulfillment).toMatchObject({
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-15T18:10:00.000Z"),
        });
    });

    it("ignores a stale due row after the fulfillment becomes terminal", async () => {
        const stale = makeFulfillment({ nextAttemptAt: new Date("2026-07-15T17:00:00.000Z") });

        fulfillment = makeFulfillment({
            status: "succeeded",
            nextAttemptAt: null,
            completedAt: fixedNow,
        });
        listDueMock.mockResolvedValue([stale] as never);

        const result = await runDueSeasonFulfillments();

        expect(result).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
        expect(searchMock).not.toHaveBeenCalled();
        expect(fulfillment.status).toBe("succeeded");
    });

    it("leaves an abandoned cancellation checkpoint for verified reconciliation", async () => {
        fulfillment = makeFulfillment({
            status: "retry_wait",
            cancellationRequestedAt: new Date("2026-07-15T17:40:00.000Z"),
            nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
            statusMessage: "Cancellation requested; Nooklet is removing the active download.",
        });
        listDueMock.mockResolvedValue([{ ...fulfillment }] as never);

        const result = await runDueSeasonFulfillments();

        expect(result).toEqual({ attemptedCount: 1, queuedCount: 0, failedCount: 0 });
        expect(fulfillment).toMatchObject({
            status: "retry_wait",
            nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
            cancellationRequestedAt: new Date("2026-07-15T17:40:00.000Z"),
            statusMessage: "Cancellation requested; Nooklet is removing the active download.",
        });
        expect(searchMock).not.toHaveBeenCalled();
    });

    it("does not persist a due-worker error after another owner takes the lease", async () => {
        fulfillment = makeFulfillment({
            nextAttemptAt: new Date("2026-07-15T17:59:00.000Z"),
        });
        listDueMock.mockResolvedValue([{ ...fulfillment }] as never);
        searchMock.mockRejectedValue(new Error("Indexer connection reset."));
        acquireMock.mockResolvedValueOnce(attemptLease).mockResolvedValueOnce(null);

        const result = await runDueSeasonFulfillments();

        expect(result).toEqual({ attemptedCount: 1, queuedCount: 0, failedCount: 1 });
        expect(updateFulfillmentMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                status: "retry_wait",
                statusMessage: expect.stringContaining("unexpected error"),
            }),
        );
    });

    it("queues an alternate pack with fulfillment metadata and prior releases excluded", async () => {
        countAttemptsMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
        listExclusionsMock.mockResolvedValue({
            resultIds: ["result-old"],
            releaseKeys: ["guid:old-guid", "title:old-season-pack"],
        });

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            {
                titleId: "title-1",
                seasonId: "season-1",
                targetLibraryPathId: "path-1",
                excludedResultIds: ["result-old"],
                excludedReleaseKeys: ["guid:old-guid", "title:old-season-pack"],
            },
            {
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "season_pack",
                attemptNumber: 2,
                maxCandidateAttempts: 2,
                workLease: expect.objectContaining({
                    requestKey: "season-fulfillment:fulfillment-1:work",
                }),
            },
        );
        expect(result.fallback).toBeNull();
        expect(result.fulfillment).toMatchObject({
            strategy: "season_pack",
            status: "active",
            packAttemptCount: 2,
            nextAttemptAt: null,
        });
        expect(listEpisodesMock).not.toHaveBeenCalled();
    });

    it("switches a failed season pack straight to episodes instead of another pack", async () => {
        const episode = makeEpisode("episode-1", 1);

        listEpisodesMock.mockResolvedValue([episode] as never);
        countAttemptsMock.mockResolvedValue(1);

        const recovery = await markSeasonPackFailedAndRecover({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            failureMessage: "The transfer stopped early: too many articles are missing.",
        });

        expect(searchMock).not.toHaveBeenCalledWith(
            "user-1",
            expect.anything(),
            expect.objectContaining({ attemptStrategy: "season_pack" }),
        );
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ episodeId: episode.id }),
            expect.objectContaining({ attemptStrategy: "episode" }),
        );
        expect(recovery?.fallback).toMatchObject({ queuedCount: 1 });
        expect(fulfillment.strategy).toBe("episodes");
    });

    it("uses one fulfillment lease so pack search and episode fallback cannot overlap", async () => {
        let enterSearch!: () => void;
        let releaseSearch!: () => void;
        const searchEntered = new Promise<void>((resolve) => {
            enterSearch = resolve;
        });
        const searchGate = new Promise<void>((resolve) => {
            releaseSearch = resolve;
        });

        acquireMock
            .mockResolvedValueOnce({
                ...attemptLease,
                expiresAt: new Date("2026-07-15T18:15:00.000Z"),
            })
            .mockResolvedValueOnce(null);
        searchMock.mockImplementation(async () => {
            enterSearch();
            await searchGate;

            return queuedSearchResult();
        });

        const first = attemptSeasonPack("user-1", "fulfillment-1");

        await searchEntered;

        expect(fulfillment.nextAttemptAt).toEqual(new Date("2026-07-15T18:15:00.000Z"));
        const overlapping = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "A concurrent fallback tried to start.",
        });

        expect(overlapping.queuedCount).toBe(0);
        expect(overlapping.message).toMatch(/already advancing/i);
        expect(searchMock).toHaveBeenCalledTimes(1);

        releaseSearch();
        await first;

        expect(acquireMock).toHaveBeenNthCalledWith(
            1,
            "user-1",
            "season-fulfillment:fulfillment-1:work",
            900_000,
        );
        expect(releaseMock).toHaveBeenCalledTimes(1);
    });

    it("re-reads episode ownership after the child lease and never queues an imported episode", async () => {
        const episode = makeEpisode("episode-1", 1);

        listEpisodesMock.mockResolvedValue([episode] as never);
        findEpisodeMock.mockResolvedValue({
            title: { id: "title-1" },
            episode: { ...episode, hasFile: true },
        } as never);

        const result = await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        expect(searchMock).not.toHaveBeenCalled();
        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: "episode-1",
                status: "succeeded",
            }),
        );
        expect(result.completed).toBe(true);
    });

    it("does not downgrade an episode imported while an unexpected search error unwinds", async () => {
        const episode = makeEpisode("episode-1", 1);

        listEpisodesMock.mockResolvedValue([episode] as never);
        searchMock.mockImplementation(async () => {
            const state = episodeStates.find((candidate) => candidate.episodeId === episode.id);

            if (state) {
                state.status = "succeeded";
            }

            throw new Error("Indexer response parsing failed.");
        });

        await queueMissingSeasonEpisodes({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "No season pack was usable.",
        });

        expect(episodeStates).toContainEqual(
            expect.objectContaining({
                episodeId: "episode-1",
                status: "succeeded",
            }),
        );
        expect(upsertEpisodeMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                episodeId: "episode-1",
                status: "retry_wait",
            }),
        );
    });

    it("keeps tracking the existing season download when a concurrent attempt conflicts", async () => {
        countAttemptsMock.mockResolvedValueOnce(1).mockResolvedValueOnce(1);
        searchMock.mockResolvedValue({
            queuedDownload: {
                queued: false,
                reason: "queue_failed",
                failureKind: "conflict",
                message: "This season already has an active download.",
            },
        } as never);

        const result = await attemptSeasonPack("user-1", "fulfillment-1");

        expect(result.fallback).toBeNull();
        expect(result.fulfillment).toMatchObject({
            status: "active",
            packAttemptCount: 1,
            statusMessage:
                "A season download is already active; Nooklet will keep tracking its coverage.",
        });
        expect(listEpisodesMock).not.toHaveBeenCalled();
    });

    it("converges a manual retry of an old blocked plan onto the current open plan", async () => {
        const blocked = makeFulfillment({ status: "blocked", nextAttemptAt: null });
        const open = makeFulfillment({
            id: "fulfillment-2",
            status: "active",
            nextAttemptAt: fixedNow,
        });

        fulfillment = open;
        findFulfillmentMock.mockImplementation(async (_userId, fulfillmentId) =>
            fulfillmentId === blocked.id ? (blocked as never) : (open as never),
        );
        findOpenFulfillmentMock.mockResolvedValue(open as never);
        countAttemptsMock.mockResolvedValue(0);

        const result = await attemptSeasonPack("user-1", blocked.id, { force: true });

        expect(result.fulfillment.id).toBe("fulfillment-2");
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ seasonId: "season-1" }),
            expect.objectContaining({ fulfillmentId: "fulfillment-2" }),
        );
    });

    it("does not clear cancellation intent when a forced resume cannot acquire the lease", async () => {
        const cancellationRequestedAt = new Date("2026-07-15T17:59:00.000Z");

        fulfillment = makeFulfillment({
            status: "retry_wait",
            cancellationRequestedAt,
        });
        acquireMock.mockResolvedValueOnce(null);

        const result = await attemptSeasonPack("user-1", fulfillment.id, { force: true });

        expect(result.fulfillment.cancellationRequestedAt).toEqual(cancellationRequestedAt);
        expect(updateFulfillmentMock).not.toHaveBeenCalledWith(
            expect.objectContaining({
                cancellationRequestedAt: null,
            }),
        );
        expect(searchMock).not.toHaveBeenCalled();
    });

    it("clears cancellation intent with an exact timestamp CAS only after acquiring the lease", async () => {
        const cancellationRequestedAt = new Date("2026-07-15T17:59:00.000Z");

        fulfillment = makeFulfillment({
            status: "retry_wait",
            cancellationRequestedAt,
        });

        await attemptSeasonPack("user-1", fulfillment.id, { force: true });

        expect(updateFulfillmentMock).toHaveBeenCalledWith(
            expect.objectContaining({
                expectedCancellationRequestedAt: cancellationRequestedAt,
                cancellationRequestedAt: null,
                status: "active",
                statusMessage: "Season recovery was resumed manually.",
            }),
        );
        expect(acquireMock.mock.invocationCallOrder[0]).toBeLessThan(
            updateFulfillmentMock.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it("does not resume when cancellation intent changes before the exact CAS", async () => {
        const originalCancellation = new Date("2026-07-15T17:59:00.000Z");
        const renewedCancellation = new Date("2026-07-15T17:59:30.000Z");

        fulfillment = makeFulfillment({
            status: "retry_wait",
            cancellationRequestedAt: originalCancellation,
        });
        updateFulfillmentMock.mockImplementationOnce(async () => {
            fulfillment = {
                ...fulfillment,
                cancellationRequestedAt: renewedCancellation,
            };

            return null;
        });

        const result = await attemptSeasonPack("user-1", fulfillment.id, { force: true });

        expect(result.fulfillment.cancellationRequestedAt).toEqual(renewedCancellation);
        expect(searchMock).not.toHaveBeenCalled();
    });

    it("reconciles partial season coverage by searching only the missing episodes", async () => {
        const episodes = [
            makeEpisode("owned-1", 1, { hasFile: true }),
            makeEpisode("owned-2", 2, { hasFile: true }),
            makeEpisode("missing-3", 3),
        ];

        listEpisodesMock.mockResolvedValue(episodes as never);
        countAttemptsMock.mockResolvedValue(1);

        const result = await reconcileSeasonCoverage({
            userId: "user-1",
            fulfillmentId: "fulfillment-1",
            reason: "The season pack imported only part of the season.",
        });

        expect(result).toMatchObject({
            episodeCount: 3,
            ownedCount: 2,
            activeCount: 1,
            queuedCount: 1,
        });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ episodeId: "missing-3" }),
            expect.objectContaining({
                fulfillmentId: "fulfillment-1",
                attemptStrategy: "episode",
            }),
        );
        expect(searchMock).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ episodeId: "owned-1" }),
            expect.anything(),
        );
        expect(searchMock).not.toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ episodeId: "owned-2" }),
            expect.anything(),
        );
    });

    it("resumes a due episode plan without queueing the same episode twice", async () => {
        fulfillment = makeFulfillment({
            strategy: "episodes",
            status: "partial",
            nextAttemptAt: new Date("2026-07-15T17:00:00.000Z"),
        });
        const episode = makeEpisode("episode-due", 1);
        const activeEpisodeIds = new Set<string>();

        listDueMock.mockImplementation(async () => [{ ...fulfillment } as never]);
        listEpisodesMock.mockResolvedValue([episode] as never);
        countAttemptsMock.mockResolvedValue(1);
        findActiveItemMock.mockImplementation(async (input) =>
            input.episodeId && activeEpisodeIds.has(input.episodeId)
                ? ({ id: `request-${input.episodeId}` } as never)
                : null,
        );
        searchMock.mockImplementation(async (_userId, input) => {
            if (input.episodeId) {
                activeEpisodeIds.add(input.episodeId);
            }

            return queuedSearchResult();
        });

        const firstPass = await runDueSeasonFulfillments();
        const repeatedPass = await runDueSeasonFulfillments();

        expect(firstPass).toEqual({ attemptedCount: 1, queuedCount: 1, failedCount: 0 });
        expect(repeatedPass).toEqual({ attemptedCount: 0, queuedCount: 0, failedCount: 0 });
        expect(searchMock).toHaveBeenCalledTimes(1);
        expect(searchMock).toHaveBeenCalledWith(
            "user-1",
            expect.objectContaining({ episodeId: "episode-due" }),
            expect.objectContaining({ fulfillmentId: "fulfillment-1", attemptStrategy: "episode" }),
        );
        expect(acquireMock).toHaveBeenNthCalledWith(
            1,
            "user-1",
            "season-fulfillment:fulfillment-1:work",
            900_000,
        );
        expect(acquireMock).toHaveBeenNthCalledWith(
            2,
            "user-1",
            "season-fulfillment:fulfillment-1:episode:episode-due",
            900_000,
        );
        expect(releaseMock).toHaveBeenCalledTimes(2);
    });
});
