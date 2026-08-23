import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadFulfillmentEpisodes,
    downloadFulfillments,
    downloadImportedFiles,
    downloadImportRuns,
    downloadQueueItems,
    downloadRequests,
    mediaLibraries,
    mediaLibraryPaths,
    mediaRequestAttempts,
    mediaTitles,
    tvEpisodes,
    tvSeasons,
    users,
} from "@/lib/database/schema";
import {
    createDownloadRequest,
    recordDownloadQueueItem,
} from "@/modules/downloads/repositories/download-repository";

import { type ImportedFileEpisodeMatch } from "./file-organization";
import { persistCompletedDownloadImports } from "./persistence";

async function seedUser() {
    const database = ensureDatabaseReady();
    const userId = randomUUID();

    database
        .insert(users)
        .values({
            id: userId,
            email: `${userId}@test.local`,
            displayName: "test",
            passwordHash: "x",
            role: "user",
        })
        .run();

    return userId;
}

function seedMoviePath(userId: string) {
    const database = ensureDatabaseReady();
    const libraryId = randomUUID();
    const libraryPathId = randomUUID();

    database
        .insert(mediaLibraries)
        .values({ id: libraryId, userId, mediaType: "movie", name: "Movies" })
        .run();
    database
        .insert(mediaLibraryPaths)
        .values({
            id: libraryPathId,
            libraryId,
            userId,
            path: "F:/Media/Movies",
            label: "Movies",
        })
        .run();

    return { libraryId, libraryPathId };
}

function seedTvEpisode(userId: string) {
    const database = ensureDatabaseReady();
    const titleId = randomUUID();
    const seasonId = randomUUID();
    const episodeId = randomUUID();

    database
        .insert(mediaTitles)
        .values({
            id: titleId,
            userId,
            mediaType: "tv",
            title: "Atomicity Test Show",
            sortTitle: "Atomicity Test Show",
            normalizedKey: `atomicity-test-${titleId}`,
        })
        .run();
    database
        .insert(tvSeasons)
        .values({
            id: seasonId,
            titleId,
            seasonNumber: 1,
            episodeCount: 1,
        })
        .run();
    database
        .insert(tvEpisodes)
        .values({
            id: episodeId,
            titleId,
            seasonId,
            seasonNumber: 1,
            episodeNumber: 1,
            hasFile: false,
        })
        .run();

    return { titleId, seasonId, episodeId };
}

function seedTvPath(userId: string) {
    const database = ensureDatabaseReady();
    const libraryId = randomUUID();
    const libraryPathId = randomUUID();

    database
        .insert(mediaLibraries)
        .values({ id: libraryId, userId, mediaType: "tv", name: `TV-${libraryId}` })
        .run();
    database
        .insert(mediaLibraryPaths)
        .values({
            id: libraryPathId,
            libraryId,
            userId,
            path: `F:/Media/TV/${libraryPathId}`,
            label: "TV",
        })
        .run();

    return { libraryId, libraryPathId };
}

function seedSeasonCheckpointFixture(userId: string) {
    const database = ensureDatabaseReady();
    const { libraryId, libraryPathId } = seedTvPath(userId);
    const titleId = randomUUID();
    const seasonId = randomUUID();
    const episodeId = randomUUID();
    const fulfillmentId = randomUUID();

    database
        .insert(mediaTitles)
        .values({
            id: titleId,
            userId,
            libraryId,
            mediaType: "tv",
            title: "Checkpoint Test Show",
            sortTitle: "Checkpoint Test Show",
            normalizedKey: `checkpoint-test-${titleId}`,
        })
        .run();
    database
        .insert(tvSeasons)
        .values({
            id: seasonId,
            titleId,
            seasonNumber: 1,
            episodeCount: 1,
        })
        .run();
    database
        .insert(tvEpisodes)
        .values({
            id: episodeId,
            titleId,
            seasonId,
            seasonNumber: 1,
            episodeNumber: 1,
            title: "Checkpoint",
            hasFile: false,
        })
        .run();
    database
        .insert(downloadFulfillments)
        .values({
            id: fulfillmentId,
            userId,
            mediaTitleId: titleId,
            seasonId,
            targetLibraryPathId: libraryPathId,
            requestedTitle: "Checkpoint Test Show S01",
            strategy: "season_pack",
            status: "active",
            nextAttemptAt: null,
            statusMessage: "Searching for a complete season pack.",
        })
        .run();
    database
        .insert(downloadFulfillmentEpisodes)
        .values({
            fulfillmentId,
            episodeId,
            status: "pending",
            nextAttemptAt: null,
        })
        .run();

    return { libraryId, libraryPathId, titleId, seasonId, episodeId, fulfillmentId };
}

function organizedMovieDownload(
    request: Record<string, unknown>,
    queueItem: Record<string, unknown>,
    pathId: string,
    id = "engine-test",
    episodeMatch: ImportedFileEpisodeMatch | null = null,
) {
    return {
        kind: "organized",
        destinationRootPath: "F:/Media/Movies/Test",
        files: [
            {
                sourcePath: "C:/Downloads/complete/Test/movie.mkv",
                destinationPath: "F:/Media/Movies/Test/movie.mkv",
                episodeMatch,
            },
        ],
        source: {
            source: {
                sourceRootPath: "C:/Downloads/complete/Test",
                target: { path: { id: pathId } },
                match: {
                    request,
                    queueItem,
                    historyItem: {
                        id,
                        statusKind: "completed",
                        completedAt: new Date("2026-05-07T00:00:00Z"),
                    },
                },
            },
        },
    } as never;
}

function organizedSeasonDownload(
    request: Record<string, unknown>,
    queueItem: Record<string, unknown>,
    fixture: { libraryPathId: string; episodeId: string },
    id = "engine-season-test",
) {
    return {
        kind: "organized",
        destinationRootPath: "F:/Media/TV/Test",
        files: [
            {
                sourcePath: "C:/Downloads/complete/Test/episode.mkv",
                destinationPath: "F:/Media/TV/Test/episode.mkv",
                episodeMatch: {
                    seasonNumber: 1,
                    episodeNumber: 1,
                    episodeId: fixture.episodeId,
                },
            },
        ],
        source: {
            source: {
                sourceRootPath: "C:/Downloads/complete/Test",
                target: { path: { id: fixture.libraryPathId } },
                match: {
                    request,
                    queueItem,
                    historyItem: {
                        id,
                        statusKind: "completed",
                        completedAt: new Date("2026-05-07T00:00:00Z"),
                    },
                },
            },
        },
    } as never;
}

function expectNoImportWrites(userId: string, requestId: string, queueItemId: string) {
    const database = ensureDatabaseReady();

    expect(
        database
            .select()
            .from(downloadImportRuns)
            .where(eq(downloadImportRuns.requestId, requestId))
            .all(),
    ).toHaveLength(0);
    expect(
        database
            .select()
            .from(downloadImportedFiles)
            .where(eq(downloadImportedFiles.userId, userId))
            .all(),
    ).toHaveLength(0);
    expect(
        database
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItemId))
            .get(),
    ).toMatchObject({
        status: "queued",
        progressPercent: 0,
        completedAt: null,
    });
    expect(
        database.select().from(downloadRequests).where(eq(downloadRequests.id, requestId)).get(),
    ).toMatchObject({
        status: "queued",
        externalJobId: null,
        statusMessage: null,
        completedAt: null,
    });
}

beforeEach(() => {
    ensureDatabaseReady();
});

describe("persistCompletedDownloadImports", () => {
    it("records a successful import and completes the download request", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Arrival",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-1",
            status: "queued",
        });

        const result = await persistCompletedDownloadImports(userId, [
            organizedMovieDownload(request, queueItem, libraryPathId, "engine-download-1"),
        ]);

        const storedRequest = ensureDatabaseReady()
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, request.id))
            .get();
        const storedQueueItem = ensureDatabaseReady()
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get();
        const importRuns = ensureDatabaseReady()
            .select()
            .from(downloadImportRuns)
            .where(eq(downloadImportRuns.requestId, request.id))
            .all();
        const importedFiles = ensureDatabaseReady()
            .select()
            .from(downloadImportedFiles)
            .where(eq(downloadImportedFiles.importRunId, importRuns[0]?.id ?? "missing"))
            .all();

        expect(result).toEqual({
            matchedCount: 1,
            importedCount: 1,
            failedCount: 0,
            importedFileCount: 1,
            affectedLibraryPathIds: [libraryPathId],
        });
        expect(storedRequest?.status).toBe("succeeded");
        expect(storedRequest?.statusMessage).toBe("Imported 1 file into the library.");
        expect(storedQueueItem?.status).toBe("completed");
        expect(storedQueueItem?.progressPercent).toBe(100);
        expect(importRuns).toHaveLength(1);
        expect(importRuns[0]?.status).toBe("succeeded");
        expect(importedFiles).toHaveLength(1);
        expect(importedFiles[0]?.destinationPath).toBe("F:/Media/Movies/Test/movie.mkv");
    });

    it("commits the durable season checkpoint with the successful request transition", async () => {
        const userId = await seedUser();
        const fixture = seedSeasonCheckpointFixture(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Checkpoint Test Show S01",
            mediaTitleId: fixture.titleId,
            seasonId: fixture.seasonId,
            episodeId: fixture.episodeId,
            fulfillmentId: fixture.fulfillmentId,
            status: "queued",
            targetLibraryId: fixture.libraryId,
            targetLibraryPathId: fixture.libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-checkpoint",
            status: "queued",
        });

        const result = await persistCompletedDownloadImports(userId, [
            organizedSeasonDownload(request, queueItem, fixture, "engine-download-checkpoint"),
        ]);

        const database = ensureDatabaseReady();
        const storedRequest = database
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, request.id))
            .get();
        const storedQueueItem = database
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get();
        const storedFulfillment = database
            .select()
            .from(downloadFulfillments)
            .where(eq(downloadFulfillments.id, fixture.fulfillmentId))
            .get();
        const storedEpisode = database
            .select()
            .from(tvEpisodes)
            .where(eq(tvEpisodes.id, fixture.episodeId))
            .get();
        const storedFulfillmentEpisode = database
            .select()
            .from(downloadFulfillmentEpisodes)
            .where(eq(downloadFulfillmentEpisodes.episodeId, fixture.episodeId))
            .get();

        expect(result).toMatchObject({
            matchedCount: 1,
            importedCount: 1,
            failedCount: 0,
            importedFileCount: 1,
            affectedLibraryPathIds: [fixture.libraryPathId],
        });
        expect(storedFulfillment?.status).toBe("partial");
        expect(storedFulfillment?.nextAttemptAt).toBeInstanceOf(Date);
        expect(storedFulfillment?.nextAttemptAt?.getTime()).toBeGreaterThan(Date.now());
        expect(storedFulfillment?.statusMessage).toBe(
            "The download imported; season coverage verification is queued.",
        );
        expect(storedRequest?.status).toBe("succeeded");
        expect(storedQueueItem?.status).toBe("completed");
        expect(storedEpisode?.hasFile).toBe(true);
        expect(storedFulfillmentEpisode).toMatchObject({
            fulfillmentId: fixture.fulfillmentId,
            episodeId: fixture.episodeId,
            status: "succeeded",
            statusMessage: "Imported 1 file; verifying season coverage.",
        });
        expect(storedFulfillment?.updatedAt.getTime()).toBeLessThanOrEqual(
            storedRequest?.updatedAt.getTime() ?? 0,
        );
    });

    it("marks failed downloader items as skipped import runs", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Arrival",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-failed",
            status: "queued",
        });

        const result = await persistCompletedDownloadImports(userId, [
            {
                kind: "failed",
                message: "The download failed in the built-in downloader.",
                source: {
                    kind: "failed",
                    message: "The download failed in the built-in downloader.",
                    source: {
                        kind: "failed",
                        message: "The download failed in the built-in downloader.",
                        match: {
                            request,
                            queueItem,
                            historyItem: {
                                id: "engine-download-failed",
                                title: "Arrival",
                                statusKind: "failed",
                                storagePath: null,
                                completedAt: new Date("2026-05-07T00:00:00Z"),
                            },
                        },
                    },
                },
            } as never,
        ]);

        const storedRequest = ensureDatabaseReady()
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, request.id))
            .get();
        const storedQueueItem = ensureDatabaseReady()
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get();
        const importRun = ensureDatabaseReady()
            .select()
            .from(downloadImportRuns)
            .where(eq(downloadImportRuns.requestId, request.id))
            .get();

        expect(result).toEqual({
            matchedCount: 1,
            importedCount: 0,
            failedCount: 1,
            importedFileCount: 0,
            affectedLibraryPathIds: [],
        });
        expect(importRun?.status).toBe("skipped");
        expect(importRun?.sourceRootPath).toBe("Arrival");
        expect(storedQueueItem?.status).toBe("failed");
        expect(storedRequest?.status).toBe("failed");
        expect(storedRequest?.statusMessage).toBe(
            "The download failed in the built-in downloader.",
        );
    });

    it("rejects a cross-tenant episode match without partial import writes", async () => {
        const userId = await seedUser();
        const foreignUserId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const { episodeId: foreignEpisodeId } = seedTvEpisode(foreignUserId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Cross-tenant episode",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-cross-tenant-episode",
            status: "queued",
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                organizedMovieDownload(
                    request,
                    queueItem,
                    libraryPathId,
                    "engine-download-cross-tenant-episode",
                    {
                        seasonNumber: 1,
                        episodeNumber: 1,
                        episodeId: foreignEpisodeId,
                    },
                ),
            ]),
        ).rejects.toThrow(/missing or is not owned by this user/);

        const database = ensureDatabaseReady();
        const foreignEpisode = database
            .select()
            .from(tvEpisodes)
            .where(eq(tvEpisodes.id, foreignEpisodeId))
            .get();

        expectNoImportWrites(userId, request.id, queueItem.id);
        expect(foreignEpisode?.hasFile).toBe(false);
    });

    it("rejects a missing episode match without terminalizing the request", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const missingEpisodeId = randomUUID();
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Missing episode",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-missing-episode",
            status: "queued",
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                organizedMovieDownload(
                    request,
                    queueItem,
                    libraryPathId,
                    "engine-download-missing-episode",
                    {
                        seasonNumber: 1,
                        episodeNumber: 1,
                        episodeId: missingEpisodeId,
                    },
                ),
            ]),
        ).rejects.toThrow(/missing or is not owned by this user/);

        expectNoImportWrites(userId, request.id, queueItem.id);
    });

    it("rolls back every import write when a later file write fails", async () => {
        const userId = await seedUser();
        const fixture = seedSeasonCheckpointFixture(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Checkpoint Test Show S01E01",
            mediaTitleId: fixture.titleId,
            seasonId: fixture.seasonId,
            episodeId: fixture.episodeId,
            fulfillmentId: fixture.fulfillmentId,
            status: "queued",
            targetLibraryId: fixture.libraryId,
            targetLibraryPathId: fixture.libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-download-atomicity",
            status: "queued",
        });

        // The first file is inserted before the malformed second file causes
        // SQLite to reject the transaction. A real rollback must remove the
        // import run and first file and leave the episode and terminal rows
        // untouched.
        await expect(
            persistCompletedDownloadImports(userId, [
                {
                    kind: "organized",
                    destinationRootPath: "F:/Media/TV/Atomicity Test Show",
                    files: [
                        {
                            sourcePath: "C:/Downloads/complete/Atomicity/Atomicity.mkv",
                            destinationPath: "F:/Media/TV/Atomicity Test Show/Atomicity.mkv",
                            episodeMatch: {
                                seasonNumber: 1,
                                episodeNumber: 1,
                                episodeId: fixture.episodeId,
                            },
                        },
                        {
                            sourcePath: "C:/Downloads/complete/Atomicity/invalid.mkv",
                            destinationPath: null as never,
                            episodeMatch: null,
                        },
                    ],
                    source: {
                        source: {
                            sourceRootPath: "C:/Downloads/complete/Checkpoint",
                            target: { path: { id: fixture.libraryPathId } },
                            match: {
                                request,
                                queueItem,
                                historyItem: {
                                    id: "engine-download-atomicity",
                                    statusKind: "completed",
                                    completedAt: new Date("2026-05-07T00:00:00Z"),
                                },
                            },
                        },
                    },
                } as never,
            ]),
        ).rejects.toThrow(/NOT NULL constraint failed.*destination_path/i);

        const database = ensureDatabaseReady();
        const storedEpisode = database
            .select()
            .from(tvEpisodes)
            .where(eq(tvEpisodes.id, fixture.episodeId))
            .get();
        const storedEpisodeFulfillment = database
            .select()
            .from(downloadFulfillmentEpisodes)
            .where(eq(downloadFulfillmentEpisodes.episodeId, fixture.episodeId))
            .get();
        const storedFulfillment = database
            .select()
            .from(downloadFulfillments)
            .where(eq(downloadFulfillments.id, fixture.fulfillmentId))
            .get();

        expectNoImportWrites(userId, request.id, queueItem.id);
        expect(storedEpisode?.hasFile).toBe(false);
        expect(storedEpisodeFulfillment).toMatchObject({
            fulfillmentId: fixture.fulfillmentId,
            episodeId: fixture.episodeId,
            status: "pending",
            nextAttemptAt: null,
            statusMessage: null,
        });
        expect(storedFulfillment?.status).toBe("partial");
    });

    it("allows the explicit failed-request and completed-queue replay lifecycle", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Retryable replay",
            status: "failed",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-retryable-replay",
            status: "completed",
        });

        await persistCompletedDownloadImports(userId, [
            organizedMovieDownload(request, queueItem, libraryPathId, "engine-retryable-replay"),
        ]);

        expect(
            ensureDatabaseReady()
                .select()
                .from(downloadRequests)
                .where(eq(downloadRequests.id, request.id))
                .get()?.status,
        ).toBe("succeeded");
        expect(
            ensureDatabaseReady()
                .select()
                .from(downloadQueueItems)
                .where(eq(downloadQueueItems.id, queueItem.id))
                .get()?.status,
        ).toBe("completed");
    });

    it("does not duplicate import rows when a terminal request is replayed", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Idempotent replay",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-terminal-replay",
            status: "queued",
        });
        const download = organizedMovieDownload(
            request,
            queueItem,
            libraryPathId,
            "engine-terminal-replay",
        );

        await persistCompletedDownloadImports(userId, [download]);
        const database = ensureDatabaseReady();
        const storedRequest = database
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, request.id))
            .get()!;
        const storedQueueItem = database
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get()!;

        const replay = await persistCompletedDownloadImports(userId, [
            organizedMovieDownload(
                storedRequest,
                storedQueueItem,
                libraryPathId,
                "engine-terminal-replay",
            ),
        ]);

        expect(replay).toMatchObject({
            matchedCount: 1,
            importedCount: 0,
            failedCount: 0,
            importedFileCount: 0,
        });
        expect(
            database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, request.id))
                .all(),
        ).toHaveLength(1);
    });

    it("accepts a terminal replay after its fulfillment is later cancelled", async () => {
        const userId = await seedUser();
        const fixture = seedSeasonCheckpointFixture(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Checkpoint Test Show S01",
            mediaTitleId: fixture.titleId,
            seasonId: fixture.seasonId,
            fulfillmentId: fixture.fulfillmentId,
            status: "queued",
            targetLibraryId: fixture.libraryId,
            targetLibraryPathId: fixture.libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-cancelled-terminal-replay",
            status: "queued",
        });
        const database = ensureDatabaseReady();

        await persistCompletedDownloadImports(userId, [
            organizedSeasonDownload(request, queueItem, fixture),
        ]);
        database
            .update(downloadFulfillments)
            .set({ cancellationRequestedAt: new Date() })
            .where(eq(downloadFulfillments.id, fixture.fulfillmentId))
            .run();

        const storedRequest = database
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, request.id))
            .get()!;
        const storedQueueItem = database
            .select()
            .from(downloadQueueItems)
            .where(eq(downloadQueueItems.id, queueItem.id))
            .get()!;
        const replay = await persistCompletedDownloadImports(userId, [
            organizedSeasonDownload(storedRequest, storedQueueItem, fixture),
        ]);

        expect(replay).toMatchObject({
            matchedCount: 1,
            importedCount: 0,
            failedCount: 0,
            importedFileCount: 0,
        });
        expect(
            database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, request.id))
                .all(),
        ).toHaveLength(1);
    });

    it("rejects a replacement or expired direct request lease before import writes", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Lease fence",
            status: "queued",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-lease-fence",
            status: "queued",
        });
        const database = ensureDatabaseReady();
        const replacementLease = {
            id: randomUUID(),
            userId,
            requestKey: `download-request:${request.id}:work`,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 15 * 60_000),
        };

        database.insert(mediaRequestAttempts).values(replacementLease).run();

        await expect(
            persistCompletedDownloadImports(
                userId,
                [organizedMovieDownload(request, queueItem, libraryPathId, "engine-lease-fence")],
                {
                    requestWorkLeases: new Map([
                        [request.id, { ...replacementLease, id: randomUUID() }],
                    ]),
                },
            ),
        ).rejects.toThrow(/expired or was replaced/);

        expect(
            database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, request.id))
                .all(),
        ).toHaveLength(0);

        database
            .update(mediaRequestAttempts)
            .set({ expiresAt: new Date(Date.now() - 1) })
            .where(eq(mediaRequestAttempts.id, replacementLease.id))
            .run();

        await expect(
            persistCompletedDownloadImports(
                userId,
                [
                    organizedMovieDownload(
                        request,
                        queueItem,
                        libraryPathId,
                        "engine-lease-fence-expired",
                    ),
                ],
                {
                    requestWorkLeases: new Map([[request.id, replacementLease]]),
                },
            ),
        ).rejects.toThrow(/expired or was replaced/);
    });

    it("rejects a destination path from another tenant or media type before scheduling", async () => {
        const userId = await seedUser();
        const foreignUserId = await seedUser();
        const { libraryId } = seedMoviePath(userId);
        const foreignPath = seedMoviePath(foreignUserId);
        const tvPath = seedTvPath(userId);
        const request = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Target isolation",
            status: "queued",
            targetLibraryId: foreignPath.libraryId,
            targetLibraryPathId: foreignPath.libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-target-isolation",
            status: "queued",
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                organizedMovieDownload(request, queueItem, foreignPath.libraryPathId),
            ]),
        ).rejects.toThrow(/destination is missing or is not owned/);

        const wrongMediaRequest = await createDownloadRequest({
            userId,
            mediaType: "movie",
            requestedTitle: "Wrong media target",
            status: "queued",
            targetLibraryId: tvPath.libraryId,
            targetLibraryPathId: tvPath.libraryPathId,
        });
        const wrongMediaQueue = await recordDownloadQueueItem({
            requestId: wrongMediaRequest.id,
            userId,
            externalQueueId: "engine-wrong-media-target",
            status: "queued",
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                organizedMovieDownload(wrongMediaRequest, wrongMediaQueue, tvPath.libraryPathId),
            ]),
        ).rejects.toThrow(/destination is missing or is not owned/);

        expect(
            ensureDatabaseReady()
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, request.id))
                .all(),
        ).toHaveLength(0);
        expect(
            ensureDatabaseReady()
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, wrongMediaRequest.id))
                .all(),
        ).toHaveLength(0);
        expect(libraryId).not.toBe(foreignPath.libraryId);
    });

    it("rejects same-tenant episode matches from the wrong title or season", async () => {
        const userId = await seedUser();
        const expected = seedSeasonCheckpointFixture(userId);
        const wrongTitle = seedSeasonCheckpointFixture(userId);
        const database = ensureDatabaseReady();
        const wrongSeasonId = randomUUID();
        const wrongSeasonEpisodeId = randomUUID();

        database
            .insert(tvSeasons)
            .values({
                id: wrongSeasonId,
                titleId: expected.titleId,
                seasonNumber: 2,
                episodeCount: 1,
            })
            .run();
        database
            .insert(tvEpisodes)
            .values({
                id: wrongSeasonEpisodeId,
                titleId: expected.titleId,
                seasonId: wrongSeasonId,
                seasonNumber: 2,
                episodeNumber: 1,
            })
            .run();

        const request = await createDownloadRequest({
            userId,
            mediaType: "tv",
            requestedTitle: "Checkpoint Test Show S01",
            mediaTitleId: expected.titleId,
            seasonId: expected.seasonId,
            status: "queued",
            targetLibraryId: expected.libraryId,
            targetLibraryPathId: expected.libraryPathId,
        });
        const queueItem = await recordDownloadQueueItem({
            requestId: request.id,
            userId,
            externalQueueId: "engine-wrong-episode-identity",
            status: "queued",
        });

        const wrongTitleDownload = organizedMovieDownload(
            request,
            queueItem,
            expected.libraryPathId,
            "engine-wrong-title",
            {
                seasonNumber: 1,
                episodeNumber: 1,
                episodeId: wrongTitle.episodeId,
            },
        );

        await expect(persistCompletedDownloadImports(userId, [wrongTitleDownload])).rejects.toThrow(
            /missing or is not owned/,
        );

        const wrongSeasonDownload = organizedMovieDownload(
            request,
            queueItem,
            expected.libraryPathId,
            "engine-wrong-season",
            {
                seasonNumber: 2,
                episodeNumber: 1,
                episodeId: wrongSeasonEpisodeId,
            },
        );

        await expect(
            persistCompletedDownloadImports(userId, [wrongSeasonDownload]),
        ).rejects.toThrow(/missing or is not owned/);
        expect(
            database
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, request.id))
                .all(),
        ).toHaveLength(0);
    });
});
