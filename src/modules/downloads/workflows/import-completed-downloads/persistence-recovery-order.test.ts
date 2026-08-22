import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    downloadFulfillments,
    downloadImportedFiles,
    downloadImportRuns,
    downloadQueueItems,
    downloadRequests,
    mediaLibraries,
    mediaLibraryPaths,
    mediaRequestAttempts,
    mediaTitles,
    tvSeasons,
    users,
} from "@/lib/database/schema";
vi.mock("@/modules/media-library/repositories/media-library-repository", () => ({
    setTvEpisodeHasFile: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-terminal-scheduling", () => ({
    scheduleSeasonFulfillmentAfterRequest: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/season-fulfillment-work-lease", () => ({
    acquireSeasonFulfillmentWorkLease: vi.fn(),
    isSeasonFulfillmentWorkLease: vi.fn(() => true),
    releaseSeasonFulfillmentWorkLease: vi.fn(),
    SEASON_FULFILLMENT_WORK_LEASE_TTL_MS: 15 * 60_000,
}));

import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
    acquireSeasonFulfillmentWorkLease,
    releaseSeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { noPrimaryMediaFilesFoundMessage } from "./file-inspection";
import { persistCompletedDownloadImports } from "./persistence";

const scheduleMock = vi.mocked(scheduleSeasonFulfillmentAfterRequest);
const acquireWorkMock = vi.mocked(acquireSeasonFulfillmentWorkLease);
const releaseWorkMock = vi.mocked(releaseSeasonFulfillmentWorkLease);

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
        .values({ id: libraryId, userId, mediaType: "tv", name: "TV" })
        .run();
    database
        .insert(mediaLibraryPaths)
        .values({
            id: libraryPathId,
            libraryId,
            userId,
            path: "F:/Media/TV",
            label: "TV",
        })
        .run();

    return { libraryId, libraryPathId };
}

function seedSeasonFulfillment(userId: string, libraryPathId: string) {
    const database = ensureDatabaseReady();
    const titleId = randomUUID();
    const seasonId = randomUUID();
    const fulfillmentId = randomUUID();

    database
        .insert(mediaTitles)
        .values({
            id: titleId,
            userId,
            mediaType: "tv",
            title: "Severance",
            sortTitle: "Severance",
            normalizedKey: `severance-${titleId}`,
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
        .insert(downloadFulfillments)
        .values({
            id: fulfillmentId,
            userId,
            mediaTitleId: titleId,
            seasonId,
            targetLibraryPathId: libraryPathId,
            requestedTitle: "Severance S01",
            strategy: "season_pack",
            status: "active",
        })
        .run();

    return { titleId, seasonId, fulfillmentId };
}

function workLeaseFor(userId: string, fulfillmentId: string) {
    const lease = {
        id: randomUUID(),
        userId,
        requestKey: `season-fulfillment:${fulfillmentId}:work`,
        expiresAt: new Date(Date.now() + 15 * 60_000),
    };

    ensureDatabaseReady()
        .insert(mediaRequestAttempts)
        .values({
            ...lease,
            createdAt: new Date(),
        })
        .run();

    return lease;
}

type SeedRequestFixtureInput = {
    userId: string;
    requestId: string;
    queueItemId: string;
    externalQueueId: string;
    mediaType: "movie" | "tv";
    requestedTitle: string;
    status?: "queued" | "failed";
    queueStatus?: "queued" | "completed";
    targetLibraryId?: string | null;
    targetLibraryPathId?: string | null;
    fulfillmentId?: string | null;
    mediaTitleId?: string | null;
    seasonId?: string | null;
};

function seedRequestFixture(input: SeedRequestFixtureInput) {
    const database = ensureDatabaseReady();

    database
        .insert(downloadRequests)
        .values({
            id: input.requestId,
            userId: input.userId,
            mediaType: input.mediaType,
            requestedTitle: input.requestedTitle,
            status: input.status ?? "queued",
            targetLibraryId: input.targetLibraryId ?? null,
            targetLibraryPathId: input.targetLibraryPathId ?? null,
            fulfillmentId: input.fulfillmentId ?? null,
            mediaTitleId: input.mediaTitleId ?? null,
            seasonId: input.seasonId ?? null,
        })
        .run();
    database
        .insert(downloadQueueItems)
        .values({
            id: input.queueItemId,
            requestId: input.requestId,
            userId: input.userId,
            externalQueueId: input.externalQueueId,
            status: input.queueStatus ?? "queued",
        })
        .run();
}

function failedDownload(input: {
    message: string;
    request: Record<string, unknown>;
    queueItem: Record<string, unknown>;
    historyItem: Record<string, unknown>;
    sourceRootPath?: string;
}) {
    const match = {
        request: input.request,
        queueItem: input.queueItem,
        historyItem: input.historyItem,
    };
    const source = input.sourceRootPath
        ? { kind: "importable", sourceRootPath: input.sourceRootPath, match }
        : {
              kind: "failed",
              message: input.message,
              match,
          };

    return {
        kind: "failed",
        message: input.message,
        source: { kind: "failed", message: input.message, source },
    } as never;
}

beforeEach(() => {
    vi.clearAllMocks();
    acquireWorkMock.mockResolvedValue(null);
    releaseWorkMock.mockResolvedValue(true);
});

describe("completed import recovery ordering", () => {
    it("makes season recovery durable before terminalizing the physical request", async () => {
        const userId = await seedUser();
        const { libraryPathId } = seedMoviePath(userId);
        const season = seedSeasonFulfillment(userId, libraryPathId);
        const workLease = workLeaseFor(userId, season.fulfillmentId);
        const db = ensureDatabaseReady();

        seedRequestFixture({
            userId,
            requestId: "request-1",
            queueItemId: "queue-1",
            externalQueueId: "history-1",
            mediaType: "tv",
            requestedTitle: "Severance S01",
            targetLibraryPathId: libraryPathId,
            fulfillmentId: season.fulfillmentId,
            mediaTitleId: season.titleId,
            seasonId: season.seasonId,
        });

        acquireWorkMock.mockResolvedValue(workLease);

        scheduleMock.mockImplementationOnce(async () => {
            const requestAtInvocation = db
                .select()
                .from(downloadRequests)
                .where(eq(downloadRequests.id, "request-1"))
                .get();

            expect(requestAtInvocation?.status).toBe("queued");

            return null;
        });

        await persistCompletedDownloadImports(userId, [
            failedDownload({
                message: "PAR2 verification failed.",
                request: {
                    id: "request-1",
                    mediaType: "tv",
                    mediaTitleId: season.titleId,
                    seasonId: season.seasonId,
                    episodeId: null,
                    fulfillmentId: season.fulfillmentId,
                    requestedTitle: "Severance S01",
                    status: "queued",
                    cancellationRequestedAt: null,
                    targetLibraryId: null,
                    targetLibraryPathId: libraryPathId,
                },
                queueItem: { id: "queue-1", status: "queued" },
                historyItem: {
                    id: "history-1",
                    title: "Severance S01",
                    statusKind: "failed",
                    failMessage: "PAR2 verification failed.",
                    completedAt: new Date(),
                    storagePath: null,
                },
            }),
        ]);

        expect(scheduleMock).toHaveBeenCalledTimes(1);

        const storedRequest = db
            .select()
            .from(downloadRequests)
            .where(eq(downloadRequests.id, "request-1"))
            .get();

        expect(storedRequest?.status).toBe("failed");
        expect(scheduleMock).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ fulfillmentId: season.fulfillmentId }),
            expect.objectContaining({ status: "failed" }),
            { workLease },
        );
        expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
    });

    it("rolls back import writes when cancellation wins before terminal CAS", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const season = seedSeasonFulfillment(userId, libraryPathId);
        const workLease = workLeaseFor(userId, season.fulfillmentId);
        const db = ensureDatabaseReady();

        seedRequestFixture({
            userId,
            requestId: "request-cancellation-race",
            queueItemId: "queue-cancellation-race",
            externalQueueId: "history-cancellation-race",
            mediaType: "tv",
            requestedTitle: "Severance S01",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
            fulfillmentId: season.fulfillmentId,
            mediaTitleId: season.titleId,
            seasonId: season.seasonId,
        });

        acquireWorkMock.mockResolvedValue(workLease);
        scheduleMock.mockImplementationOnce(async () => {
            db.update(downloadRequests)
                .set({ cancellationRequestedAt: new Date() })
                .where(eq(downloadRequests.id, "request-cancellation-race"))
                .run();

            return null;
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                failedDownload({
                    message: "Cancellation won the race.",
                    request: {
                        id: "request-cancellation-race",
                        mediaType: "tv",
                        mediaTitleId: season.titleId,
                        seasonId: season.seasonId,
                        episodeId: null,
                        fulfillmentId: season.fulfillmentId,
                        requestedTitle: "Severance S01",
                        status: "queued",
                        cancellationRequestedAt: null,
                        targetLibraryId: libraryId,
                        targetLibraryPathId: libraryPathId,
                    },
                    queueItem: {
                        id: "queue-cancellation-race",
                        status: "queued",
                    },
                    historyItem: {
                        id: "history-cancellation-race",
                        title: "Severance S01",
                        statusKind: "failed",
                        failMessage: "Cancellation won the race.",
                        completedAt: new Date(),
                        storagePath: null,
                    },
                }),
            ]),
        ).rejects.toThrow(/no longer open|changed during import/);

        expect(
            db
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, "request-cancellation-race"))
                .all(),
        ).toHaveLength(0);
        expect(
            db
                .select()
                .from(downloadImportedFiles)
                .where(eq(downloadImportedFiles.userId, userId))
                .all(),
        ).toHaveLength(0);
        expect(
            db
                .select()
                .from(downloadQueueItems)
                .where(eq(downloadQueueItems.id, "queue-cancellation-race"))
                .get()?.status,
        ).toBe("queued");
        expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
    });

    it("terminalizes a failed transfer when its destination is disabled", async () => {
        const userId = await seedUser();
        const { libraryId, libraryPathId } = seedMoviePath(userId);
        const season = seedSeasonFulfillment(userId, libraryPathId);
        const workLease = workLeaseFor(userId, season.fulfillmentId);
        const db = ensureDatabaseReady();

        seedRequestFixture({
            userId,
            requestId: "request-path-race",
            queueItemId: "queue-path-race",
            externalQueueId: "history-path-race",
            mediaType: "tv",
            requestedTitle: "Severance S01",
            targetLibraryId: libraryId,
            targetLibraryPathId: libraryPathId,
            fulfillmentId: season.fulfillmentId,
            mediaTitleId: season.titleId,
            seasonId: season.seasonId,
        });

        acquireWorkMock.mockResolvedValue(workLease);
        scheduleMock.mockImplementationOnce(async () => {
            db.update(mediaLibraryPaths)
                .set({ status: "disabled" })
                .where(eq(mediaLibraryPaths.id, libraryPathId))
                .run();

            return null;
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                failedDownload({
                    message: "The destination changed during import.",
                    request: {
                        id: "request-path-race",
                        mediaType: "tv",
                        mediaTitleId: season.titleId,
                        seasonId: season.seasonId,
                        episodeId: null,
                        fulfillmentId: season.fulfillmentId,
                        requestedTitle: "Severance S01",
                        status: "queued",
                        cancellationRequestedAt: null,
                        targetLibraryId: libraryId,
                        targetLibraryPathId: libraryPathId,
                    },
                    queueItem: { id: "queue-path-race", status: "queued" },
                    historyItem: {
                        id: "history-path-race",
                        title: "Severance S01",
                        statusKind: "failed",
                        failMessage: "The destination changed during import.",
                        completedAt: new Date(),
                        storagePath: null,
                    },
                }),
            ]),
        ).resolves.toMatchObject({ matchedCount: 1, failedCount: 1 });

        expect(
            db
                .select()
                .from(downloadImportRuns)
                .where(eq(downloadImportRuns.requestId, "request-path-race"))
                .all(),
        ).toMatchObject([{ status: "skipped" }]);
        expect(
            db
                .select()
                .from(downloadQueueItems)
                .where(eq(downloadQueueItems.id, "queue-path-race"))
                .get()?.status,
        ).toBe("failed");
        expect(
            db
                .select()
                .from(downloadRequests)
                .where(eq(downloadRequests.id, "request-path-race"))
                .get()?.status,
        ).toBe("failed");
        expect(releaseWorkMock).toHaveBeenCalledWith(workLease);
    });

    it("rejects a mis-owned request before scheduling season recovery", async () => {
        const ownerUserId = await seedUser();
        const wrongUserId = await seedUser();
        const { libraryPathId } = seedMoviePath(ownerUserId);
        const db = ensureDatabaseReady();

        seedRequestFixture({
            userId: ownerUserId,
            requestId: "request-mis-owned",
            queueItemId: "queue-mis-owned",
            externalQueueId: "history-mis-owned",
            mediaType: "movie",
            requestedTitle: "Mis-owned request",
            targetLibraryPathId: libraryPathId,
        });

        await expect(
            persistCompletedDownloadImports(wrongUserId, [
                failedDownload({
                    message: "The request belongs to another user.",
                    request: {
                        id: "request-mis-owned",
                        mediaType: "movie",
                        mediaTitleId: null,
                        seasonId: null,
                        episodeId: null,
                        fulfillmentId: null,
                        requestedTitle: "Mis-owned request",
                        status: "queued",
                        cancellationRequestedAt: null,
                        targetLibraryId: null,
                        targetLibraryPathId: libraryPathId,
                    },
                    queueItem: { id: "queue-mis-owned", status: "queued" },
                    historyItem: {
                        id: "history-mis-owned",
                        title: "Mis-owned request",
                        statusKind: "failed",
                        failMessage: "The request belongs to another user.",
                        completedAt: new Date(),
                        storagePath: null,
                    },
                }),
            ]),
        ).rejects.toThrow(/not owned by this user/);

        expect(scheduleMock).not.toHaveBeenCalled();
        expect(
            db
                .select()
                .from(downloadRequests)
                .where(eq(downloadRequests.id, "request-mis-owned"))
                .get()?.status,
        ).toBe("queued");
        expect(
            db
                .select()
                .from(downloadQueueItems)
                .where(eq(downloadQueueItems.id, "queue-mis-owned"))
                .get()?.status,
        ).toBe("queued");
    });

    it("rejects a stale request snapshot before acquiring its season lease", async () => {
        const userId = await seedUser();
        const { libraryPathId } = seedMoviePath(userId);
        const season = seedSeasonFulfillment(userId, libraryPathId);
        const db = ensureDatabaseReady();

        seedRequestFixture({
            userId,
            requestId: "request-stale-snapshot",
            queueItemId: "queue-stale-snapshot",
            externalQueueId: "history-stale-snapshot",
            mediaType: "tv",
            requestedTitle: "Severance S01",
            targetLibraryPathId: libraryPathId,
            fulfillmentId: season.fulfillmentId,
            mediaTitleId: season.titleId,
            seasonId: season.seasonId,
        });

        await expect(
            persistCompletedDownloadImports(userId, [
                failedDownload({
                    message: "The request snapshot is stale.",
                    request: {
                        id: "request-stale-snapshot",
                        mediaType: "tv",
                        mediaTitleId: randomUUID(),
                        seasonId: randomUUID(),
                        episodeId: null,
                        fulfillmentId: randomUUID(),
                        requestedTitle: "Severance S01",
                        status: "queued",
                        cancellationRequestedAt: null,
                        targetLibraryId: null,
                        targetLibraryPathId: libraryPathId,
                    },
                    queueItem: { id: "queue-stale-snapshot", status: "queued" },
                    historyItem: {
                        id: "history-stale-snapshot",
                        title: "Severance S01",
                        statusKind: "failed",
                        failMessage: "The request snapshot is stale.",
                        completedAt: new Date(),
                        storagePath: null,
                    },
                }),
            ]),
        ).rejects.toThrow(/snapshot no longer matches/);

        expect(acquireWorkMock).not.toHaveBeenCalled();
        expect(scheduleMock).not.toHaveBeenCalled();
        expect(
            db
                .select()
                .from(downloadRequests)
                .where(eq(downloadRequests.id, "request-stale-snapshot"))
                .get()?.status,
        ).toBe("queued");
        expect(
            db
                .select()
                .from(downloadQueueItems)
                .where(eq(downloadQueueItems.id, "queue-stale-snapshot"))
                .get()?.status,
        ).toBe("queued");
    });

    it("classifies a sample-or-extras-only season pack as retryable content", async () => {
        const userId = await seedUser();
        const { libraryPathId } = seedMoviePath(userId);
        const season = seedSeasonFulfillment(userId, libraryPathId);
        const workLease = workLeaseFor(userId, season.fulfillmentId);

        seedRequestFixture({
            userId,
            requestId: "request-2",
            queueItemId: "queue-2",
            externalQueueId: "history-2",
            mediaType: "tv",
            requestedTitle: "Severance S01",
            targetLibraryPathId: libraryPathId,
            fulfillmentId: season.fulfillmentId,
            mediaTitleId: season.titleId,
            seasonId: season.seasonId,
        });

        acquireWorkMock.mockResolvedValue(workLease);

        await persistCompletedDownloadImports(userId, [
            failedDownload({
                message: noPrimaryMediaFilesFoundMessage,
                sourceRootPath: "F:/Downloads/Severance.S01",
                request: {
                    id: "request-2",
                    mediaType: "tv",
                    mediaTitleId: season.titleId,
                    seasonId: season.seasonId,
                    episodeId: null,
                    fulfillmentId: season.fulfillmentId,
                    requestedTitle: "Severance S01",
                    status: "queued",
                    cancellationRequestedAt: null,
                    targetLibraryId: null,
                    targetLibraryPathId: libraryPathId,
                },
                queueItem: { id: "queue-2", status: "queued" },
                historyItem: {
                    id: "history-2",
                    title: "Severance S01",
                    statusKind: "completed",
                    failMessage: null,
                    completedAt: new Date(),
                    storagePath: "F:/Downloads/Severance.S01",
                },
            }),
        ]);

        expect(scheduleMock).toHaveBeenCalledWith(
            userId,
            expect.objectContaining({ fulfillmentId: season.fulfillmentId }),
            expect.objectContaining({
                status: "failed",
                retryableContentFailure: true,
            }),
            { workLease },
        );
    });
});
