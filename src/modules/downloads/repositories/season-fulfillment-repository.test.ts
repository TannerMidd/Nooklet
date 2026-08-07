import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    engineDownloads,
    indexerSearchResults,
    indexerSearchRuns,
    mediaLibraries,
    mediaLibraryPaths,
    mediaTitles,
    tvEpisodes,
    tvSeasons,
    users,
} from "@/lib/database/schema";

import { createDownloadRequest, recordDownloadQueueItem } from "./download-repository";
import {
    attachDownloadRequestToFulfillment,
    countDownloadFulfillmentAttempts,
    createOrGetOpenSeasonFulfillment,
    findActiveDownloadRequestForFulfillment,
    findDownloadFulfillmentById,
    findOpenSeasonFulfillment,
    listDownloadFulfillmentEpisodes,
    listDownloadFulfillmentEpisodesForIds,
    listDueCancellationDownloadFulfillments,
    listDueDownloadFulfillments,
    listFulfillmentReleaseExclusions,
    updateDownloadFulfillment,
    updateDownloadFulfillmentEpisode,
    upsertDownloadFulfillmentEpisode,
} from "./season-fulfillment-repository";

function seedUserWithTv(title = "Severance") {
    const database = ensureDatabaseReady();
    const userId = randomUUID();
    const libraryId = randomUUID();
    const libraryPathId = randomUUID();
    const mediaTitleId = randomUUID();
    const seasonId = randomUUID();
    const secondSeasonId = randomUUID();
    const episodeId = randomUUID();
    const secondEpisodeId = randomUUID();
    const alienEpisodeId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "Test User",
            passwordHash: "x",
            role: "user",
        })
        .run();
    database
        .insert(mediaLibraries)
        .values({
            id: libraryId,
            userId,
            mediaType: "tv",
            name: "TV",
        })
        .run();
    database
        .insert(mediaLibraryPaths)
        .values({
            id: libraryPathId,
            libraryId,
            userId,
            path: `F:/TV/${userId}`,
            label: "TV",
        })
        .run();
    database
        .insert(mediaTitles)
        .values({
            id: mediaTitleId,
            userId,
            libraryId,
            mediaType: "tv",
            title,
            sortTitle: title.toLowerCase(),
            year: 2022,
            normalizedKey: `${title.toLowerCase()}::2022::${userId}`,
            status: "missing",
        })
        .run();
    database
        .insert(tvSeasons)
        .values([
            { id: seasonId, titleId: mediaTitleId, seasonNumber: 1 },
            { id: secondSeasonId, titleId: mediaTitleId, seasonNumber: 2 },
        ])
        .run();
    database
        .insert(tvEpisodes)
        .values([
            {
                id: episodeId,
                titleId: mediaTitleId,
                seasonId,
                seasonNumber: 1,
                episodeNumber: 1,
                title: "Good News About Hell",
            },
            {
                id: secondEpisodeId,
                titleId: mediaTitleId,
                seasonId,
                seasonNumber: 1,
                episodeNumber: 2,
                title: "Half Loop",
            },
            {
                id: alienEpisodeId,
                titleId: mediaTitleId,
                seasonId: secondSeasonId,
                seasonNumber: 2,
                episodeNumber: 1,
                title: "Hello, Ms. Cobel",
            },
        ])
        .run();

    return {
        userId,
        libraryPathId,
        mediaTitleId,
        seasonId,
        secondSeasonId,
        episodeId,
        secondEpisodeId,
        alienEpisodeId,
    };
}

function seedSearchResult(userId: string, title: string, guid: string) {
    const database = ensureDatabaseReady();
    const searchRunId = randomUUID();
    const resultId = randomUUID();

    database
        .insert(indexerSearchRuns)
        .values({
            id: searchRunId,
            userId,
            mediaType: "tv",
            query: title,
            status: "succeeded",
            expiresAt: new Date("2030-01-01T00:00:00Z"),
        })
        .run();
    database
        .insert(indexerSearchResults)
        .values({
            id: resultId,
            searchRunId,
            userId,
            mediaType: "tv",
            title,
            normalizedTitle: title.toLowerCase(),
            indexerGuid: guid,
        })
        .run();

    return resultId;
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("season-fulfillment-repository", () => {
    it("converges on one open season fulfillment and enforces tenant ownership", async () => {
        const owner = seedUserWithTv();
        const other = seedUserWithTv("Silo");

        const first = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
            targetLibraryPathId: owner.libraryPathId,
        });
        const repeated = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "A duplicate request",
        });

        expect(repeated.id).toBe(first.id);
        expect(await findDownloadFulfillmentById(owner.userId, first.id)).toMatchObject({
            id: first.id,
            strategy: "season_pack",
            status: "active",
            packAttemptLimit: 3,
        });
        expect(await findDownloadFulfillmentById(other.userId, first.id)).toBeNull();
        expect(
            await findOpenSeasonFulfillment({
                userId: other.userId,
                mediaTitleId: owner.mediaTitleId,
                seasonId: owner.seasonId,
            }),
        ).toBeNull();
        await expect(
            createOrGetOpenSeasonFulfillment({
                userId: other.userId,
                mediaTitleId: owner.mediaTitleId,
                seasonId: owner.seasonId,
                requestedTitle: "Not mine",
            }),
        ).rejects.toThrow("target was not found");

        await updateDownloadFulfillment({
            userId: owner.userId,
            fulfillmentId: first.id,
            status: "succeeded",
            completedAt: new Date(),
        });
        const next = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "A later request",
        });

        expect(next.id).not.toBe(first.id);
    });

    it("tracks exact pack and per-episode attempts, exclusions, and active work", async () => {
        const owner = seedUserWithTv();
        const fulfillment = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
        });
        const packResultId = seedSearchResult(owner.userId, "Severance S01 PACK", "pack-guid");
        const firstEpisodeResultId = seedSearchResult(owner.userId, "Severance S01E01", "e01-guid");
        const secondEpisodeResultId = seedSearchResult(
            owner.userId,
            "Severance S01E02",
            "e02-guid",
        );
        const packRequest = await createDownloadRequest({
            userId: owner.userId,
            mediaType: "tv",
            requestedTitle: "Severance Season 1",
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            searchResultId: packResultId,
            status: "queued",
        });
        const firstEpisodeRequest = await createDownloadRequest({
            userId: owner.userId,
            mediaType: "tv",
            requestedTitle: "Severance S01E01",
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            episodeId: owner.episodeId,
            searchResultId: firstEpisodeResultId,
            status: "failed",
        });
        const secondEpisodeRequest = await createDownloadRequest({
            userId: owner.userId,
            mediaType: "tv",
            requestedTitle: "Severance S01E02",
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            episodeId: owner.secondEpisodeId,
            searchResultId: secondEpisodeResultId,
            status: "downloading",
        });

        expect(
            await attachDownloadRequestToFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                requestId: packRequest.id,
                attemptStrategy: "season_pack",
                attemptNumber: 1,
            }),
        ).toMatchObject({ fulfillmentId: fulfillment.id, attemptNumber: 1 });
        await attachDownloadRequestToFulfillment({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            requestId: firstEpisodeRequest.id,
            attemptStrategy: "episode",
            attemptNumber: 1,
        });
        await attachDownloadRequestToFulfillment({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            requestId: secondEpisodeRequest.id,
            attemptStrategy: "episode",
            attemptNumber: 1,
        });

        expect(
            await countDownloadFulfillmentAttempts({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "season_pack",
            }),
        ).toBe(1);
        expect(
            await countDownloadFulfillmentAttempts({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "episode",
                episodeId: owner.episodeId,
            }),
        ).toBe(1);
        expect(
            await listFulfillmentReleaseExclusions({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "season_pack",
            }),
        ).toEqual({
            resultIds: [packResultId],
            releaseKeys: ["guid:pack-guid", "title:severance s01 pack"],
        });
        expect(
            await listFulfillmentReleaseExclusions({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "episode",
                episodeId: owner.episodeId,
            }),
        ).toEqual({
            resultIds: [firstEpisodeResultId],
            releaseKeys: ["guid:e01-guid", "title:severance s01e01"],
        });
        expect(
            await findActiveDownloadRequestForFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "season_pack",
            }),
        ).toMatchObject({ id: packRequest.id });
        expect(
            await findActiveDownloadRequestForFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "episode",
                episodeId: owner.episodeId,
            }),
        ).toBeNull();
        expect(
            await findActiveDownloadRequestForFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "episode",
                episodeId: owner.secondEpisodeId,
            }),
        ).toMatchObject({ id: secondEpisodeRequest.id });
    });

    it("excludes zero-transfer engine failures from the fulfillment attempt budget", async () => {
        const database = ensureDatabaseReady();
        const owner = seedUserWithTv();
        const fulfillment = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
        });

        const seedPackAttempt = async (options: {
            guid: string;
            attemptNumber: number;
            engine: { downloadedBytes: number; failureKind: "content" | "infrastructure" } | null;
        }) => {
            const request = await createDownloadRequest({
                userId: owner.userId,
                mediaType: "tv",
                requestedTitle: "Severance Season 1",
                mediaTitleId: owner.mediaTitleId,
                seasonId: owner.seasonId,
                searchResultId: seedSearchResult(
                    owner.userId,
                    `Severance S01 ${options.guid}`,
                    options.guid,
                ),
                status: "failed",
            });

            await attachDownloadRequestToFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                requestId: request.id,
                attemptStrategy: "season_pack",
                attemptNumber: options.attemptNumber,
            });

            if (options.engine) {
                const engineId = randomUUID();

                database
                    .insert(engineDownloads)
                    .values({
                        id: engineId,
                        userId: owner.userId,
                        name: `Severance S01 ${options.guid}`,
                        nzbXml: "<nzb />",
                        state: "failed",
                        failureKind: options.engine.failureKind,
                        downloadedBytes: options.engine.downloadedBytes,
                    })
                    .run();
                await recordDownloadQueueItem({
                    requestId: request.id,
                    userId: owner.userId,
                    externalQueueId: engineId,
                    status: "failed",
                });
            }
        };

        // Dead post, zero bytes: budget-free.
        await seedPackAttempt({
            guid: "pack-dead",
            attemptNumber: 1,
            engine: { downloadedBytes: 0, failureKind: "content" },
        });
        // Partial transfer: consumes budget.
        await seedPackAttempt({
            guid: "pack-partial",
            attemptNumber: 2,
            engine: { downloadedBytes: 1024, failureKind: "content" },
        });
        // No engine telemetry: consumes budget conservatively.
        await seedPackAttempt({ guid: "pack-untracked", attemptNumber: 3, engine: null });

        expect(
            await countDownloadFulfillmentAttempts({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                attemptStrategy: "season_pack",
            }),
        ).toBe(2);
        // The dead post still stays excluded from future release searches.
        expect(
            (
                await listFulfillmentReleaseExclusions({
                    userId: owner.userId,
                    fulfillmentId: fulfillment.id,
                    attemptStrategy: "season_pack",
                })
            ).releaseKeys,
        ).toEqual(expect.arrayContaining(["guid:pack-dead"]));
    });

    it("updates due fulfillment and episode state without crossing tenants or seasons", async () => {
        const owner = seedUserWithTv();
        const other = seedUserWithTv("Silo");
        const fulfillment = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
        });
        const dueAt = new Date("2026-01-01T00:00:00Z");
        const updated = await updateDownloadFulfillment({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            strategy: "episodes",
            status: "retry_wait",
            packAttemptCount: 3,
            nextAttemptAt: dueAt,
            statusMessage: "Waiting to retry missing episodes.",
        });

        expect(updated).toMatchObject({
            strategy: "episodes",
            status: "retry_wait",
            packAttemptCount: 3,
            statusMessage: "Waiting to retry missing episodes.",
        });
        expect(
            await listDueDownloadFulfillments({
                userId: owner.userId,
                now: new Date("2026-01-02T00:00:00Z"),
            }),
        ).toEqual([expect.objectContaining({ id: fulfillment.id })]);
        expect(
            await listDueDownloadFulfillments({
                userId: other.userId,
                now: new Date("2026-01-02T00:00:00Z"),
            }),
        ).toEqual([]);

        await upsertDownloadFulfillmentEpisode({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            episodeId: owner.episodeId,
            status: "pending",
        });
        const episode = await updateDownloadFulfillmentEpisode({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            episodeId: owner.episodeId,
            status: "retry_wait",
            attemptCount: 2,
            nextAttemptAt: dueAt,
            statusMessage: "Trying another release.",
        });

        expect(episode).toMatchObject({
            status: "retry_wait",
            attemptCount: 2,
            statusMessage: "Trying another release.",
        });
        expect(
            await listDownloadFulfillmentEpisodes({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                statuses: ["retry_wait"],
                dueBefore: new Date("2026-01-02T00:00:00Z"),
            }),
        ).toEqual([expect.objectContaining({ episodeId: owner.episodeId })]);
        expect(
            await updateDownloadFulfillmentEpisode({
                userId: other.userId,
                fulfillmentId: fulfillment.id,
                episodeId: owner.episodeId,
                status: "succeeded",
            }),
        ).toBeNull();
        expect(
            await listDownloadFulfillmentEpisodes({
                userId: other.userId,
                fulfillmentId: fulfillment.id,
            }),
        ).toEqual([]);
        expect(
            await listDownloadFulfillmentEpisodesForIds({
                userId: owner.userId,
                fulfillmentIds: [fulfillment.id, randomUUID()],
            }),
        ).toEqual([
            expect.objectContaining({
                fulfillmentId: fulfillment.id,
                episodeId: owner.episodeId,
                status: "retry_wait",
            }),
        ]);
        expect(
            await listDownloadFulfillmentEpisodesForIds({
                userId: other.userId,
                fulfillmentIds: [fulfillment.id],
            }),
        ).toEqual([]);
        await expect(
            upsertDownloadFulfillmentEpisode({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                episodeId: owner.alienEpisodeId,
                status: "pending",
            }),
        ).rejects.toThrow("target was not found");
    });

    it("compares cancellation checkpoints exactly when a guarded transition resumes work", async () => {
        const owner = seedUserWithTv();
        const fulfillment = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
        });
        const cancellationRequestedAt = new Date("2026-07-15T17:59:00.000Z");

        await updateDownloadFulfillment({
            userId: owner.userId,
            fulfillmentId: fulfillment.id,
            cancellationRequestedAt,
        });

        expect(
            await updateDownloadFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                expectedCancellationRequestedAt: null,
                cancellationRequestedAt: null,
                status: "active",
            }),
        ).toBeNull();

        expect(
            await updateDownloadFulfillment({
                userId: owner.userId,
                fulfillmentId: fulfillment.id,
                expectedCancellationRequestedAt: cancellationRequestedAt,
                cancellationRequestedAt: null,
                status: "active",
            }),
        ).toMatchObject({
            cancellationRequestedAt: null,
            status: "active",
        });
    });

    it("lists due cancellation checkpoints independently from normal recovery work", async () => {
        const owner = seedUserWithTv();
        const cancellation = await createOrGetOpenSeasonFulfillment({
            userId: owner.userId,
            mediaTitleId: owner.mediaTitleId,
            seasonId: owner.seasonId,
            requestedTitle: "Severance Season 1",
        });
        const requestedAt = new Date("2026-07-15T17:59:00.000Z");

        await updateDownloadFulfillment({
            userId: owner.userId,
            fulfillmentId: cancellation.id,
            status: "retry_wait",
            cancellationRequestedAt: requestedAt,
            nextAttemptAt: new Date("2026-07-15T18:00:00.000Z"),
        });

        expect(
            await listDueCancellationDownloadFulfillments({
                now: new Date("2026-07-15T18:01:00.000Z"),
            }),
        ).toEqual([
            expect.objectContaining({
                id: cancellation.id,
                cancellationRequestedAt: requestedAt,
            }),
        ]);
        expect(
            await listDueCancellationDownloadFulfillments({
                now: new Date("2026-07-15T17:59:30.000Z"),
            }),
        ).toEqual([]);
    });
});
