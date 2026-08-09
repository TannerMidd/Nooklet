import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/repositories/download-repository", () => ({
    countDownloadRequestHistory: vi.fn(),
    listDownloadRequestHistoryPage: vi.fn(),
    listRecentDownloadRequestsWithQueueItems: vi.fn(),
}));
vi.mock("@/modules/downloads/repositories/season-fulfillment-repository", () => ({
    listDownloadFulfillmentEpisodeDetailsForIds: vi.fn(),
}));

import {
    countDownloadRequestHistory,
    listDownloadRequestHistoryPage,
    listRecentDownloadRequestsWithQueueItems,
} from "@/modules/downloads/repositories/download-repository";
import { listDownloadFulfillmentEpisodeDetailsForIds } from "@/modules/downloads/repositories/season-fulfillment-repository";

import { getDownloadActivityPage, listDownloadActivity } from "./list-download-activity";

const listRequestsMock = vi.mocked(listRecentDownloadRequestsWithQueueItems);
const countHistoryMock = vi.mocked(countDownloadRequestHistory);
const listHistoryPageMock = vi.mocked(listDownloadRequestHistoryPage);
const listFulfillmentEpisodesMock = vi.mocked(listDownloadFulfillmentEpisodeDetailsForIds);

function row(queueStatus: "completed" | "failed" | "queued" | null) {
    return {
        request: {
            id: "request-1",
            mediaType: "movie",
            requestedTitle: "Arrival",
            releaseTitle: "Arrival.2016.1080p",
            status: "failed",
            statusMessage: "Import failed.",
            retryCount: 0,
            mediaTitleId: "title-1",
            createdAt: new Date("2026-07-15T12:00:00Z"),
            completedAt: new Date("2026-07-15T13:00:00Z") as Date | null,
        },
        queueItem: queueStatus
            ? {
                  status: queueStatus,
                  progressPercent: queueStatus === "completed" ? 100 : 0,
                  sizeBytes: 1_000,
                  etaSeconds: null,
              }
            : null,
        fulfillment: null as ReturnType<typeof openEpisodeFulfillment> | null,
    };
}

function openEpisodeFulfillment() {
    return {
        id: "fulfillment-1",
        userId: "user-1",
        mediaTitleId: "title-1",
        seasonId: "season-1",
        targetLibraryPathId: "path-1",
        requestedTitle: "Fringe Season 1",
        strategy: "episodes",
        status: "partial",
        packAttemptCount: 3,
        packAttemptLimit: 3,
        nextAttemptAt: new Date("2026-07-15T14:00:00Z"),
        statusMessage: "Using individual episodes: 2 active, 18 retrying.",
        createdAt: new Date("2026-07-15T11:00:00Z"),
        updatedAt: new Date("2026-07-15T13:05:00Z"),
        completedAt: null,
    };
}

function bareFulfillmentRow(overrides: Partial<ReturnType<typeof openEpisodeFulfillment>> = {}) {
    return {
        request: null,
        queueItem: null,
        fulfillment: { ...openEpisodeFulfillment(), ...overrides },
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    listFulfillmentEpisodesMock.mockResolvedValue([]);
});

describe("listDownloadActivity", () => {
    it("offers an import retry after a completed download fails during import", async () => {
        listRequestsMock.mockResolvedValue([row("completed")] as never);

        const result = await listDownloadActivity("user-1");

        expect(result[0]).toEqual(
            expect.objectContaining({
                canRetry: true,
                retryAction: "retry_import",
            }),
        );
    });

    it("offers another release when the download itself did not complete", async () => {
        listRequestsMock.mockResolvedValue([row("failed")] as never);

        const result = await listDownloadActivity("user-1");

        expect(result[0]).toEqual(
            expect.objectContaining({
                canRetry: true,
                retryAction: "find_alternative_release",
            }),
        );
    });

    it("groups a recovering season and does not expose failed pack attempts as terminal", async () => {
        const packAttempt = row("failed");

        packAttempt.request = {
            ...packAttempt.request,
            id: "request-pack",
            mediaType: "tv",
            requestedTitle: "Fringe Season 1",
            releaseTitle: "Fringe.S01.PACK",
            status: "failed",
            statusMessage: "PAR2 repair failed.",
            createdAt: new Date("2026-07-15T11:05:00Z"),
        };
        packAttempt.fulfillment = openEpisodeFulfillment();

        const episodeAttempt = row("queued");

        episodeAttempt.request = {
            ...episodeAttempt.request,
            id: "request-episode",
            mediaType: "tv",
            requestedTitle: "Fringe S01E01",
            releaseTitle: "Fringe.S01E01.1080p",
            status: "queued",
            statusMessage: "Queued as an individual episode.",
            createdAt: new Date("2026-07-15T13:00:00Z"),
            completedAt: null,
        };
        episodeAttempt.fulfillment = openEpisodeFulfillment();

        listRequestsMock.mockResolvedValue([episodeAttempt, packAttempt] as never);

        const result = await listDownloadActivity("user-1");

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
            expect.objectContaining({
                id: "fulfillment-1",
                requestId: "request-episode",
                requestedTitle: "Fringe Season 1",
                status: "recovering",
                isRecovering: true,
                canRetry: false,
                retryAction: null,
                attemptCount: 2,
                failedAttemptCount: 1,
                planMessage:
                    "Season plan switched to individual episodes after 3 season pack attempts.",
                nextAttemptAt: new Date("2026-07-15T14:00:00Z"),
            }),
        );
    });

    it("summarizes recovery and exposes ordered unresolved episode details", async () => {
        listRequestsMock.mockResolvedValue([bareFulfillmentRow()] as never);
        listFulfillmentEpisodesMock.mockResolvedValue([
            {
                state: { fulfillmentId: "fulfillment-1", status: "succeeded" },
                episode: { id: "episode-1", seasonNumber: 1, episodeNumber: 1, title: "Pilot" },
            },
            {
                state: {
                    fulfillmentId: "fulfillment-1",
                    status: "active",
                    attemptCount: 1,
                    statusMessage: "S01E02 queued.",
                    nextAttemptAt: null,
                },
                episode: {
                    id: "episode-2",
                    seasonNumber: 1,
                    episodeNumber: 2,
                    title: "Same Old Story",
                },
            },
            {
                state: {
                    fulfillmentId: "fulfillment-1",
                    status: "retry_wait",
                    attemptCount: 0,
                    statusMessage: "S01E03 will retry.",
                    nextAttemptAt: new Date("2026-07-15T14:30:00Z"),
                },
                episode: { id: "episode-3", seasonNumber: 1, episodeNumber: 3, title: null },
            },
            {
                state: {
                    fulfillmentId: "fulfillment-1",
                    status: "unavailable",
                    attemptCount: 0,
                    statusMessage: "S01E04 has no usable release.",
                    nextAttemptAt: new Date("2026-07-15T20:00:00Z"),
                },
                episode: {
                    id: "episode-4",
                    seasonNumber: 1,
                    episodeNumber: 4,
                    title: "The Arrival",
                },
            },
        ] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(listFulfillmentEpisodesMock).toHaveBeenCalledWith({
            userId: "user-1",
            fulfillmentIds: ["fulfillment-1"],
        });
        expect(entry.seasonEpisodeProgress).toEqual({
            total: 4,
            pending: 0,
            active: 1,
            retry_wait: 1,
            succeeded: 1,
            unavailable: 1,
            blocked: 0,
            deferred: 0,
        });
        expect(entry.seasonEpisodeDetails).toEqual([
            {
                episodeId: "episode-2",
                episodeCode: "S01E02",
                title: "Same Old Story",
                status: "active",
                attemptCount: 1,
                statusMessage: "S01E02 queued.",
                nextAttemptAt: null,
            },
            {
                episodeId: "episode-3",
                episodeCode: "S01E03",
                title: "Episode 3",
                status: "retry_wait",
                attemptCount: 0,
                statusMessage: "S01E03 will retry.",
                nextAttemptAt: new Date("2026-07-15T14:30:00Z"),
            },
            {
                episodeId: "episode-4",
                episodeCode: "S01E04",
                title: "The Arrival",
                status: "unavailable",
                attemptCount: 0,
                statusMessage: "S01E04 has no usable release.",
                nextAttemptAt: new Date("2026-07-15T20:00:00Z"),
            },
        ]);
    });

    it("shows durable cancellation as in progress with an undo action", async () => {
        listRequestsMock.mockResolvedValue([
            bareFulfillmentRow({
                cancellationRequestedAt: new Date("2026-07-15T13:30:00Z"),
                statusMessage:
                    "Cancellation is pending while Nooklet verifies the downloader queue.",
            } as never),
        ] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry).toEqual(
            expect.objectContaining({
                status: "cancelling",
                cancellationPending: true,
                isRecovering: false,
                canRetry: true,
                retryAction: "resume_season_recovery",
            }),
        );
    });

    it("shows standalone request cleanup as cancelling without offering retry", async () => {
        const cancelling = row("queued");

        cancelling.request = {
            ...cancelling.request,
            status: "queued",
            statusMessage: "Cancellation is pending while Nooklet verifies downloader cleanup.",
            cancellationRequestedAt: new Date("2026-07-15T13:30:00Z"),
            completedAt: null,
        } as never;
        listRequestsMock.mockResolvedValue([cancelling] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry).toEqual(
            expect.objectContaining({
                status: "cancelling",
                cancellationPending: true,
                isRecovering: false,
                canRetry: false,
                retryAction: null,
            }),
        );
    });

    it("shows a finalized standalone tombstone as cancelled", async () => {
        const cancelled = row("failed");

        cancelled.request = {
            ...cancelled.request,
            status: "cancelled",
            statusMessage: "Removed from the download queue.",
            cancellationRequestedAt: new Date("2026-07-15T13:30:00Z"),
            completedAt: new Date("2026-07-15T13:31:00Z"),
        } as never;
        listRequestsMock.mockResolvedValue([cancelled] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry).toEqual(
            expect.objectContaining({
                status: "cancelled",
                cancellationPending: false,
                isRecovering: false,
            }),
        );
    });

    it("shows a zero-attempt blocked season as one actionable logical plan", async () => {
        listRequestsMock.mockResolvedValue([
            bareFulfillmentRow({
                status: "blocked",
                strategy: "episodes",
                packAttemptCount: 0,
                statusMessage: "No episode metadata is available yet.",
            }),
        ] as never);

        const result = await listDownloadActivity("user-1");

        expect(result).toEqual([
            expect.objectContaining({
                id: "fulfillment-1",
                requestId: null,
                fulfillmentId: "fulfillment-1",
                requestedTitle: "Fringe Season 1",
                status: "failed",
                attemptCount: 0,
                canRetry: true,
                retryAction: "resume_season_recovery",
                planMessage: "Season recovery paused. Resume it to re-check every missing episode.",
            }),
        ]);
    });

    it("surfaces a mixed blocked and unavailable episode plan as resumable attention", async () => {
        listRequestsMock.mockResolvedValue([
            bareFulfillmentRow({
                status: "blocked",
                strategy: "episodes",
                statusMessage: "Using individual episodes: 1 awaiting a release, 1 blocked.",
            }),
        ] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry).toEqual(
            expect.objectContaining({
                status: "failed",
                statusMessage: "Using individual episodes: 1 awaiting a release, 1 blocked.",
                isRecovering: false,
                canRetry: true,
                retryAction: "resume_season_recovery",
                planMessage:
                    "Season recovery paused after 3 season pack attempts. Resume it to re-check every missing episode.",
            }),
        );
    });

    it("keeps manual retry suppressed for a zero-attempt open season plan", async () => {
        listRequestsMock.mockResolvedValue([bareFulfillmentRow()] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry).toEqual(
            expect.objectContaining({
                status: "recovering",
                isRecovering: true,
                canRetry: false,
                retryAction: null,
            }),
        );
    });

    it("aggregates every queue row for the representative attempt deterministically", async () => {
        const first = row("queued");

        first.request = {
            ...first.request,
            status: "downloading",
            completedAt: null,
        };
        first.queueItem = {
            id: "queue-b",
            status: "downloading",
            progressPercent: 25,
            sizeBytes: 2_000,
            etaSeconds: 120,
            updatedAt: new Date("2026-07-15T12:02:00Z"),
        } as never;
        const second = {
            ...first,
            queueItem: {
                id: "queue-a",
                status: "queued",
                progressPercent: 0,
                sizeBytes: 2_000,
                etaSeconds: 60,
                updatedAt: new Date("2026-07-15T12:01:00Z"),
            },
        };

        listRequestsMock.mockResolvedValue([second, first] as never);

        const [entry] = await listDownloadActivity("user-1");

        expect(entry.queue).toEqual({
            status: "downloading",
            progressPercent: 12.5,
            sizeBytes: 2_000,
            etaSeconds: 120,
        });
        expect(entry.attemptCount).toBe(1);
    });

    it("paginates and searches the complete status-specific request history", async () => {
        countHistoryMock
            .mockResolvedValueOnce(51)
            .mockResolvedValueOnce(4)
            .mockResolvedValueOnce(2)
            .mockResolvedValueOnce(45);
        listHistoryPageMock.mockResolvedValue({ rows: [row("completed")] as never, total: 51 });

        const result = await getDownloadActivityPage({
            userId: "user-1",
            view: "completed",
            query: " Arrival ",
            page: 2,
        });

        expect(listHistoryPageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                query: "Arrival",
                limit: 25,
                offset: 25,
                statuses: ["succeeded"],
            }),
        );
        expect(result.pagination).toEqual(
            expect.objectContaining({ page: 2, pageCount: 3, total: 51 }),
        );
        expect(result.counts).toEqual({ active: 4, attention: 2, completed: 45 });
    });
});
