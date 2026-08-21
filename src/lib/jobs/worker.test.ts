import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/downloads/queries/list-users-with-active-download-requests", () => ({
    listUsersWithActiveDownloadRequestsForImport: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/import-completed-engine-downloads", () => ({
    importCompletedEngineDownloadsWorkflow: vi.fn(),
}));
vi.mock("@/modules/download-engine/queue/engine-repository", () => ({
    listUsersWithUnimportedFinishedEngineDownloads: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/modules/download-engine/runtime/engine-runner", () => ({
    ensureEngineRunnerStarted: vi.fn(() => Promise.resolve()),
}));
vi.mock("@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations", () => ({
    reconcilePendingSeasonFulfillmentCancellations: vi.fn(),
}));
vi.mock("@/modules/downloads/workflows/reconcile-download-request-cancellations", () => ({
    reconcilePendingDownloadRequestCancellations: vi.fn(),
}));
vi.mock("@/modules/jobs/repositories/job-repository", () => ({
    claimDueJobs: vi.fn(),
    completeJobRun: vi.fn(),
    createImmediateJob: vi.fn(),
    failJobRun: vi.fn(),
    heartbeatJobRun: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/scan-library", () => ({
    scanMediaLibraryWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/search-missing-monitored", () => ({
    searchMissingMonitoredContentWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/delete-media-title-with-files", () => ({
    deleteMediaTitleWithFilesWorkflow: vi.fn(),
}));
vi.mock("@/modules/media-library/workflows/retire-media-title-preserving-files", () => ({
    retireMediaTitlePreservingFilesWorkflow: vi.fn(),
}));
vi.mock("@/modules/youtube/public", () => ({
    ensureYouTubeRunnerStarted: vi.fn(() => Promise.resolve()),
    syncAllActiveYouTubeSources: vi.fn(),
    syncYouTubeSourceNow: vi.fn(),
}));
vi.mock("@/lib/jobs/worker-heartbeat", async (importOriginal) => {
    const original = await importOriginal<typeof import("@/lib/jobs/worker-heartbeat")>();

    return { ...original, writeBackgroundWorkerHeartbeat: vi.fn() };
});
vi.mock("@/lib/observability/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { reconcilePendingSeasonFulfillmentCancellations } from "@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations";
import { reconcilePendingDownloadRequestCancellations } from "@/modules/downloads/workflows/reconcile-download-request-cancellations";
import {
    claimDueJobs,
    completeJobRun,
    createImmediateJob,
    failJobRun,
} from "@/modules/jobs/repositories/job-repository";
import { deleteMediaTitleWithFilesWorkflow } from "@/modules/media-library/workflows/delete-media-title-with-files";
import { retireMediaTitlePreservingFilesWorkflow } from "@/modules/media-library/workflows/retire-media-title-preserving-files";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
import { searchMissingMonitoredContentWorkflow } from "@/modules/media-library/workflows/search-missing-monitored";
import {
    ensureYouTubeRunnerStarted,
    syncAllActiveYouTubeSources,
    syncYouTubeSourceNow,
} from "@/modules/youtube/public";

import { backgroundWorkerStaleAfterMs } from "@/lib/jobs/worker-readiness";
import { logger } from "@/lib/observability/logger";

import {
    createWorkerFilesystemProgressHeartbeat,
    getBackgroundWorkerHealth,
    runDueJobs,
    stopBackgroundWorker,
} from "./worker";

const listActiveUsersMock = vi.mocked(listUsersWithActiveDownloadRequestsForImport);
const importCompletedEngineDownloadsMock = vi.mocked(importCompletedEngineDownloadsWorkflow);
const ensureEngineRunnerMock = vi.mocked(ensureEngineRunnerStarted);
const reconcileCancellationsMock = vi.mocked(reconcilePendingSeasonFulfillmentCancellations);
const reconcileRequestCancellationsMock = vi.mocked(reconcilePendingDownloadRequestCancellations);
const claimDueJobsMock = vi.mocked(claimDueJobs);
const completeJobRunMock = vi.mocked(completeJobRun);
const createImmediateJobMock = vi.mocked(createImmediateJob);
const failJobRunMock = vi.mocked(failJobRun);
const deleteMediaTitleWithFilesMock = vi.mocked(deleteMediaTitleWithFilesWorkflow);
const retireMediaTitleMock = vi.mocked(retireMediaTitlePreservingFilesWorkflow);
const scanMediaLibraryMock = vi.mocked(scanMediaLibraryWorkflow);
const searchMissingContentMock = vi.mocked(searchMissingMonitoredContentWorkflow);
const ensureYouTubeRunnerMock = vi.mocked(ensureYouTubeRunnerStarted);
const syncAllYouTubeSourcesMock = vi.mocked(syncAllActiveYouTubeSources);
const syncYouTubeSourceMock = vi.mocked(syncYouTubeSourceNow);
const loggerInfoMock = vi.mocked(logger.info);
const loggerErrorMock = vi.mocked(logger.error);

beforeEach(() => {
    vi.clearAllMocks();
    listActiveUsersMock.mockResolvedValue([]);
    importCompletedEngineDownloadsMock.mockResolvedValue(null);
    claimDueJobsMock.mockResolvedValue([]);
    completeJobRunMock.mockResolvedValue(true);
    failJobRunMock.mockResolvedValue(true);
    scanMediaLibraryMock.mockResolvedValue({
        discoveredFileCount: 0,
        matchedTitleCount: 0,
    } as never);
    searchMissingContentMock.mockResolvedValue({
        searchedCount: 0,
        queuedCount: 0,
        unmatchedCount: 0,
    });
    syncAllYouTubeSourcesMock.mockResolvedValue([]);
    syncYouTubeSourceMock.mockResolvedValue({} as never);
    deleteMediaTitleWithFilesMock.mockResolvedValue({
        removedTitle: {},
        fileOutcomes: [],
        filesRequestedForDeletion: true,
    } as never);
    retireMediaTitleMock.mockResolvedValue({
        status: "removed",
        removedTitle: {},
        cancellationCheckpointCount: 0,
    } as never);
});

describe("runDueJobs", () => {
    it("imports completed downloads for users with active requests before scheduled jobs", async () => {
        listActiveUsersMock.mockResolvedValue(["user1", "user2"]);

        await runDueJobs();

        expect(importCompletedEngineDownloadsMock).toHaveBeenNthCalledWith(
            1,
            "user1",
            {},
            { onFilesystemProgress: expect.any(Function) },
        );
        expect(importCompletedEngineDownloadsMock).toHaveBeenNthCalledWith(
            2,
            "user2",
            {},
            { onFilesystemProgress: expect.any(Function) },
        );
        expect(reconcileRequestCancellationsMock).toHaveBeenCalledTimes(1);
        expect(reconcileRequestCancellationsMock.mock.invocationCallOrder[0]).toBeLessThan(
            importCompletedEngineDownloadsMock.mock.invocationCallOrder[0],
        );
        expect(ensureYouTubeRunnerMock).toHaveBeenCalledTimes(1);
        expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 1);
        expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 1);
        expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 1);
    });

    it("continues scheduled jobs when a completed-download import fails", async () => {
        listActiveUsersMock.mockResolvedValue(["user1", "user2"]);
        importCompletedEngineDownloadsMock.mockImplementation(async (userId: string) => {
            if (userId === "user1") {
                throw new Error("Engine output is unavailable.");
            }

            return null;
        });

        await runDueJobs();

        expect(importCompletedEngineDownloadsMock).toHaveBeenCalledTimes(2);
        expect(claimDueJobsMock).toHaveBeenCalledWith("watch-history-sync", expect.any(Date), 1);
        expect(claimDueJobsMock).toHaveBeenCalledWith("media-library-scan", expect.any(Date), 1);
        expect(claimDueJobsMock).toHaveBeenCalledWith("recommendation-run", expect.any(Date), 1);
    });
    reconcileRequestCancellationsMock.mockResolvedValue({
        attemptedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        failedCount: 0,
    });
    reconcileCancellationsMock.mockResolvedValue({
        attemptedCount: 0,
        cancelledCount: 0,
        pendingCount: 0,
        failedCount: 0,
    });

    it("does not refresh its tick when a prior maintenance pass is still stuck", async () => {
        let releaseCancellationPass!: () => void;

        reconcileCancellationsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseCancellationPass = () =>
                        resolve({
                            attemptedCount: 0,
                            cancelledCount: 0,
                            pendingCount: 0,
                            failedCount: 0,
                        });
                }),
        );

        const firstPass = runDueJobs();

        await vi.waitFor(() => expect(reconcileCancellationsMock).toHaveBeenCalled());
        const firstTick = getBackgroundWorkerHealth().lastTickAt;

        await runDueJobs();

        expect(getBackgroundWorkerHealth()).toMatchObject({
            runningPass: true,
            lastTickAt: firstTick,
        });

        releaseCancellationPass();
        await firstPass;
    });

    it("stops accepting passes and drains the active pass before shutdown resolves", async () => {
        let releaseCancellationPass!: () => void;

        reconcileCancellationsMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseCancellationPass = () =>
                        resolve({
                            attemptedCount: 0,
                            cancelledCount: 0,
                            pendingCount: 0,
                            failedCount: 0,
                        });
                }),
        );

        const activePass = runDueJobs();

        await vi.waitFor(() => expect(reconcileCancellationsMock).toHaveBeenCalled());
        const claimCountAtShutdown = claimDueJobsMock.mock.calls.length;
        let drainResolved = false;
        const drain = stopBackgroundWorker().then(() => {
            drainResolved = true;
        });

        await Promise.resolve();
        expect(drainResolved).toBe(false);
        await runDueJobs();
        expect(claimDueJobsMock).toHaveBeenCalledTimes(claimCountAtShutdown);

        releaseCancellationPass();
        await activePass;
        await drain;
        expect(drainResolved).toBe(true);
    });

    it("does not let other lane heartbeats mask a wedged filesystem scan", async () => {
        let releaseScan!: () => void;

        scanMediaLibraryMock.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    releaseScan = () =>
                        resolve({
                            discoveredFileCount: 0,
                            matchedTitleCount: 0,
                            failedPathCount: 0,
                            scanRunIds: [],
                        });
                }),
        );
        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "media-library-scan"
                ? ([
                      {
                          id: "job-scan-stuck",
                          userId: "user1",
                          jobType: "media-library-scan",
                          targetType: "media-library",
                          targetKey: "manual",
                          scheduleMinutes: 0,
                          runToken: "run-scan-stuck",
                      },
                  ] as never)
                : [],
        );

        const pass = runDueJobs();

        await vi.waitFor(() => expect(scanMediaLibraryMock).toHaveBeenCalled());

        expect(ensureEngineRunnerMock).not.toHaveBeenCalled();
        expect(claimDueJobsMock).not.toHaveBeenCalledWith(
            "watch-history-sync",
            expect.any(Date),
            1,
        );

        releaseScan();
        await pass;
        expect(ensureEngineRunnerMock).toHaveBeenCalledOnce();
    });

    it("routes a request-scoped completed import through the built-in downloader", async () => {
        const requestId = "11111111-1111-4111-8111-111111111111";

        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "download-import"
                ? ([
                      {
                          id: "job-import",
                          userId: "user1",
                          jobType: "download-import",
                          targetType: "download-request",
                          targetKey: requestId,
                          runToken: "run-import",
                      },
                  ] as never)
                : [],
        );
        importCompletedEngineDownloadsMock.mockResolvedValue({
            matchedCount: 1,
            importedCount: 1,
            failedCount: 0,
        } as never);
        await runDueJobs();

        expect(importCompletedEngineDownloadsMock).toHaveBeenCalledWith(
            "user1",
            { requestId },
            { onFilesystemProgress: expect.any(Function) },
        );
        expect(completeJobRunMock).toHaveBeenCalledWith("job-import", "run-import");
        expect(loggerInfoMock).toHaveBeenCalledWith("worker_job_started", {
            jobId: "job-import",
            jobType: "download-import",
        });
        expect(loggerInfoMock).toHaveBeenCalledWith("worker_job_completed", {
            jobId: "job-import",
            jobType: "download-import",
            durationMs: expect.any(Number),
            resultPersisted: true,
        });
        expect(failJobRunMock).not.toHaveBeenCalledWith(
            "job-import",
            "run-import",
            expect.any(String),
        );
    });

    it("keeps a long import live only when its filesystem operation advances", () => {
        let now = 0;
        const recordedAt: number[] = [];
        const reportProgress = createWorkerFilesystemProgressHeartbeat({
            now: () => now,
            intervalMs: 5_000,
            record: (at) => recordedAt.push(at.getTime()),
        });

        for (now = 0; now <= 180_000; now += 30_000) {
            reportProgress();
            reportProgress();
        }

        expect(recordedAt).toEqual([0, 30_000, 60_000, 90_000, 120_000, 150_000, 180_000]);
        expect(
            Math.max(...recordedAt.slice(1).map((at, index) => at - recordedAt[index])),
        ).toBeLessThan(backgroundWorkerStaleAfterMs);
    });

    it("fails an invalid or unmatched request-scoped import instead of reporting false success", async () => {
        const requestId = "22222222-2222-4222-8222-222222222222";

        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "download-import"
                ? ([
                      {
                          id: "job-import-empty",
                          userId: "user1",
                          jobType: "download-import",
                          targetType: "download-request",
                          targetKey: requestId,
                          runToken: "run-import-empty",
                      },
                  ] as never)
                : [],
        );

        await runDueJobs();

        expect(failJobRunMock).toHaveBeenCalledWith(
            "job-import-empty",
            "run-import-empty",
            "The requested download was not found in completed downloader history.",
        );
        expect(loggerErrorMock).toHaveBeenCalledWith("worker_job_failed", {
            jobId: "job-import-empty",
            jobType: "download-import",
            durationMs: expect.any(Number),
            resultPersisted: true,
            errorMessage: "The requested download was not found in completed downloader history.",
        });
    });

    it("runs media title deletion in the worker and surfaces failed file outcomes", async () => {
        const titleId = "33333333-3333-4333-8333-333333333333";

        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "media-title-delete"
                ? ([
                      {
                          id: "job-delete",
                          userId: "user1",
                          jobType: "media-title-delete",
                          targetType: "media-title",
                          targetKey: titleId,
                          runToken: "run-delete",
                      },
                  ] as never)
                : [],
        );
        deleteMediaTitleWithFilesMock.mockResolvedValue({
            removedTitle: {},
            filesRequestedForDeletion: true,
            fileOutcomes: [{ filePath: "/media/broken.mkv", status: "failed" }],
        } as never);

        await runDueJobs();

        expect(deleteMediaTitleWithFilesMock).toHaveBeenCalledWith("user1", {
            titleId,
            deleteFiles: true,
        });
        expect(failJobRunMock).toHaveBeenCalledWith(
            "job-delete",
            "run-delete",
            expect.stringContaining("/media/broken.mkv"),
        );
    });

    it("keeps safe title removal enabled while downloader cancellation is pending", async () => {
        const titleId = "44444444-4444-4444-8444-444444444444";

        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "media-title-delete"
                ? ([
                      {
                          id: "job-retire",
                          userId: "user1",
                          jobType: "media-title-delete",
                          targetType: "media-title-preserve-files",
                          targetKey: titleId,
                          runToken: "run-retire",
                      },
                  ] as never)
                : [],
        );
        retireMediaTitleMock.mockResolvedValue({
            status: "pending",
            removedTitle: null,
            cancellationCheckpointCount: 1,
        });

        await runDueJobs();

        expect(retireMediaTitleMock).toHaveBeenCalledWith("user1", titleId);
        expect(createImmediateJobMock).toHaveBeenCalledWith({
            userId: "user1",
            jobType: "media-title-delete",
            targetType: "media-title-preserve-files",
            targetKey: titleId,
        });
        expect(completeJobRunMock).toHaveBeenCalledWith("job-retire", "run-retire");
        expect(failJobRunMock).not.toHaveBeenCalledWith(
            "job-retire",
            "run-retire",
            expect.anything(),
        );
    });

    it("runs due media library scan jobs", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) => {
            if (jobType !== "media-library-scan") {
                return [];
            }

            return [
                {
                    id: "job1",
                    userId: "user1",
                    jobType: "media-library-scan",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 120,
                    runToken: "run1",
                },
            ] as never;
        });

        await runDueJobs();

        expect(scanMediaLibraryMock).toHaveBeenCalledWith("user1", {});
    });

    it("runs an explicitly queued manual media library scan in the worker", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) => {
            if (jobType !== "media-library-scan") {
                return [];
            }

            return [
                {
                    id: "job-manual",
                    userId: "user1",
                    jobType: "media-library-scan",
                    targetType: "media-library",
                    targetKey: "manual",
                    scheduleMinutes: null,
                    runToken: "run-manual",
                },
            ] as never;
        });

        await runDueJobs();

        expect(scanMediaLibraryMock).toHaveBeenCalledWith("user1", {});
    });

    it("runs the shared YouTube source schedule", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "youtube-source-sync"
                ? ([
                      {
                          id: "job-youtube-all",
                          userId: "admin-1",
                          jobType: "youtube-source-sync",
                          targetType: "youtube",
                          targetKey: "all",
                          scheduleMinutes: 360,
                          runToken: "run-youtube-all",
                      },
                  ] as never)
                : [],
        );

        await runDueJobs();

        expect(syncAllYouTubeSourcesMock).toHaveBeenCalledTimes(1);
        expect(syncYouTubeSourceMock).not.toHaveBeenCalled();
    });

    it("runs a targeted personal YouTube source sync", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "youtube-source-sync"
                ? ([
                      {
                          id: "job-youtube-source",
                          userId: "user-1",
                          jobType: "youtube-source-sync",
                          targetType: "youtube-source",
                          targetKey: "11111111-1111-4111-8111-111111111111",
                          scheduleMinutes: 0,
                          runToken: "run-youtube-source",
                      },
                  ] as never)
                : [],
        );

        await runDueJobs();

        expect(syncYouTubeSourceMock).toHaveBeenCalledWith(
            "user-1",
            "11111111-1111-4111-8111-111111111111",
        );
    });

    it("runs an on-demand all-sources YouTube sync without replacing the recurring job", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) =>
            jobType === "youtube-source-sync"
                ? ([
                      {
                          id: "job-youtube-run-now",
                          userId: "admin-1",
                          jobType: "youtube-source-sync",
                          targetType: "youtube-run-now",
                          targetKey: "all:1787112000000",
                          scheduleMinutes: 0,
                          runToken: "run-youtube-now",
                      },
                  ] as never)
                : [],
        );

        await runDueJobs();

        expect(syncAllYouTubeSourcesMock).toHaveBeenCalledTimes(1);
    });

    it("runs due missing-content search jobs", async () => {
        claimDueJobsMock.mockImplementation(async (jobType) => {
            if (jobType !== "missing-content-search") {
                return [];
            }

            return [
                {
                    id: "job1",
                    userId: "user1",
                    jobType: "missing-content-search",
                    targetType: "media-library",
                    targetKey: "all",
                    scheduleMinutes: 720,
                    runToken: "run1",
                },
            ] as never;
        });

        await runDueJobs();

        expect(claimDueJobsMock).toHaveBeenCalledWith(
            "missing-content-search",
            expect.any(Date),
            1,
        );
        expect(searchMissingContentMock).toHaveBeenCalledWith("user1");
    });

    // The maintenance pass routinely outlives backgroundWorkerStaleAfterMs: the
    // import sweep runs per user against a bounded downloader timeout, and season
    // recovery runs indexer searches per fulfillment. Recording progress only at
    // the end made a busy worker read as dead, which took /api/health to 503 and
    // the container to unhealthy.
    it("stays responsive through a maintenance pass that outlives the stale window", async () => {
        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));
            listActiveUsersMock.mockResolvedValue(["user-1", "user-2", "user-3"]);
            const observedAgesMs: number[] = [];

            importCompletedEngineDownloadsMock.mockImplementation(async () => {
                const lastProgressAt = getBackgroundWorkerHealth().lastProgressAt;

                observedAgesMs.push(Date.now() - (lastProgressAt?.getTime() ?? 0));
                // This user's import takes longer than the whole stale window.
                vi.setSystemTime(new Date(Date.now() + 90_000));

                return null;
            });

            await runDueJobs();

            expect(observedAgesMs).toHaveLength(3);

            for (const ageMs of observedAgesMs) {
                expect(ageMs).toBeLessThan(backgroundWorkerStaleAfterMs);
            }
        } finally {
            vi.useRealTimers();
        }
    });

    // The other half of the property: progress must come from completed units,
    // never a timer, so a wedged mount still surfaces as a stale worker.
    it("records no progress while a single unit is in flight", async () => {
        vi.useFakeTimers();

        try {
            vi.setSystemTime(new Date("2026-08-05T00:00:00.000Z"));
            listActiveUsersMock.mockResolvedValue(["user-1"]);
            let progressAtEntry: number | null = null;
            let progressAfterStall: number | null = null;

            importCompletedEngineDownloadsMock.mockImplementation(async () => {
                progressAtEntry = getBackgroundWorkerHealth().lastProgressAt?.getTime() ?? null;
                vi.setSystemTime(new Date(Date.now() + 90_000));
                await Promise.resolve();
                progressAfterStall = getBackgroundWorkerHealth().lastProgressAt?.getTime() ?? null;

                return null;
            });

            await runDueJobs();

            expect(progressAtEntry).not.toBeNull();
            expect(progressAfterStall).toBe(progressAtEntry);
        } finally {
            vi.useRealTimers();
        }
    });
});
