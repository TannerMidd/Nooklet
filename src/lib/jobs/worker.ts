import {
    claimDueJobs,
    completeJobRun,
    createImmediateJob,
    failJobRun,
    heartbeatJobRun,
    type StoredJob,
} from "@/modules/jobs/repositories/job-repository";
import { type JobType } from "@/lib/database/schema";
import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { listUsersWithUnimportedFinishedEngineDownloads } from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { runDueSeasonFulfillments } from "@/modules/downloads/workflows/season-fulfillment";
import { reconcilePendingSeasonFulfillmentCancellations } from "@/modules/downloads/workflows/reconcile-season-fulfillment-cancellations";
import { reconcilePendingDownloadRequestCancellations } from "@/modules/downloads/workflows/reconcile-download-request-cancellations";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import { refreshTvMetadataWorkflow } from "@/modules/media-library/workflows/refresh-tv-metadata";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
import { searchMissingMonitoredContentWorkflow } from "@/modules/media-library/workflows/search-missing-monitored";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { pruneOperationalHistory } from "@/modules/jobs/workflows/prune-operational-history";
import { parsePlexWatchHistorySourceMetadata } from "@/modules/watch-history/plex-watch-history-source-metadata";
import { executeQueuedRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";
import { parseWatchHistorySourceMetadataJson } from "@/modules/watch-history/source-metadata";
import { findWatchHistorySourceByType } from "@/modules/watch-history/queries/find-watch-history-source-by-type";
import { syncPlexWatchHistory } from "@/modules/watch-history/workflows/sync-plex-watch-history";
import { parseTautulliWatchHistorySourceMetadata } from "@/modules/watch-history/tautulli-watch-history-source-metadata";
import { syncTautulliWatchHistory } from "@/modules/watch-history/workflows/sync-tautulli-watch-history";
import { parseTraktWatchHistorySourceMetadata } from "@/modules/watch-history/trakt-watch-history-source-metadata";
import { syncTraktWatchHistory } from "@/modules/watch-history/workflows/sync-trakt-watch-history";
import { deleteMediaTitleWithFilesWorkflow } from "@/modules/media-library/workflows/delete-media-title-with-files";
import { retireMediaTitlePreservingFilesWorkflow } from "@/modules/media-library/workflows/retire-media-title-preserving-files";
import {
    type BackgroundWorkerHealth,
    writeBackgroundWorkerHeartbeat,
} from "@/lib/jobs/worker-heartbeat";
import { logger } from "@/lib/observability/logger";
import {
    ensureYouTubeRunnerStarted,
    syncAllActiveYouTubeSources,
    syncYouTubeSourceNow,
} from "@/modules/youtube/public";

type WorkerState = {
    started?: boolean;
    stopping?: boolean;
    runningPass?: boolean;
    runningMaintenance?: boolean;
    activeJobTypes?: Set<JobType>;
    timer?: NodeJS.Timeout;
    startedAt?: Date;
    activePassStartedAt?: Date;
    lastProgressAt?: Date;
    lastTickAt?: Date;
    lastSuccessAt?: Date;
    lastError?: string | null;
    lastRetentionAt?: Date;
    drainWaiters?: Set<() => void>;
};

const workerGlobals = globalThis as typeof globalThis & {
    __nookletWorker?: WorkerState;
};

const sharedWorkerState = workerGlobals.__nookletWorker ?? {};

workerGlobals.__nookletWorker = sharedWorkerState;
sharedWorkerState.activeJobTypes ??= new Set<JobType>();
sharedWorkerState.drainWaiters ??= new Set<() => void>();

const workerIntervalMs = 15_000;
const jobHeartbeatIntervalMs = 30_000;
const filesystemProgressHeartbeatIntervalMs = 5_000;
const retentionIntervalMs = 24 * 60 * 60 * 1_000;
const filesystemJobTypes = new Set<JobType>([
    "download-import",
    "media-library-scan",
    "media-title-delete",
]);

export function getBackgroundWorkerHealth(): BackgroundWorkerHealth {
    return {
        started: sharedWorkerState.started === true,
        runningPass: sharedWorkerState.runningPass === true,
        runningMaintenance: sharedWorkerState.runningMaintenance === true,
        startedAt: sharedWorkerState.startedAt ?? null,
        activePassStartedAt: sharedWorkerState.activePassStartedAt ?? null,
        lastProgressAt: sharedWorkerState.lastProgressAt ?? null,
        lastTickAt: sharedWorkerState.lastTickAt ?? null,
        lastSuccessAt: sharedWorkerState.lastSuccessAt ?? null,
        lastError: sharedWorkerState.lastError ?? null,
    };
}

function persistWorkerHealth() {
    if (process.env.NODE_ENV === "test") {
        return;
    }

    try {
        writeBackgroundWorkerHeartbeat(getBackgroundWorkerHealth());
    } catch (error) {
        // The worker must keep running if its diagnostic file is temporarily
        // unavailable. Readiness will correctly become stale in the web process.
        logger.error("worker_heartbeat_persistence_failed", { error });
    }
}

function recordWorkerProgress(at = new Date()) {
    sharedWorkerState.lastProgressAt = at;
    persistWorkerHealth();
}

/**
 * Translate bytes actually read or written by a filesystem workflow into a
 * throttled worker heartbeat. Unrelated timers never call this reporter, so a
 * mount-blocked operation still goes stale and is recycled.
 */
export function createWorkerFilesystemProgressHeartbeat(
    options: {
        now?: () => number;
        intervalMs?: number;
        record?: (at: Date) => void;
    } = {},
) {
    const now = options.now ?? Date.now;
    const intervalMs = options.intervalMs ?? filesystemProgressHeartbeatIntervalMs;
    const record = options.record ?? recordWorkerProgress;
    let lastRecordedAt = Number.NEGATIVE_INFINITY;

    return () => {
        const timestamp = now();

        if (timestamp - lastRecordedAt < intervalMs) {
            return;
        }

        lastRecordedAt = timestamp;
        record(new Date(timestamp));
    };
}

function workerErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Background worker failed unexpectedly.";
}

function recordWorkerFailure(error: unknown, context: string) {
    const message = workerErrorMessage(error);

    sharedWorkerState.lastError = `${context}: ${message}`;
    persistWorkerHealth();
    logger.error("worker_pass_error", { context, error });
}

async function runPlexJob(job: StoredJob) {
    const source = await findWatchHistorySourceByType(job.userId, "plex");
    const metadata = parsePlexWatchHistorySourceMetadata(
        parseWatchHistorySourceMetadataJson(source?.metadataJson),
    );

    if (!source || !metadata) {
        throw new Error(
            "Plex auto-sync requires an existing synced source with a saved user selection.",
        );
    }

    const tvResult = await syncPlexWatchHistory(job.userId, {
        mediaType: "tv",
        plexUserId: metadata.selectedUserId,
        importLimit: metadata.importLimit,
    });

    if (!tvResult.ok) {
        throw new Error(tvResult.message);
    }

    const movieResult = await syncPlexWatchHistory(job.userId, {
        mediaType: "movie",
        plexUserId: metadata.selectedUserId,
        importLimit: metadata.importLimit,
    });

    if (!movieResult.ok) {
        throw new Error(movieResult.message);
    }
}

async function runTautulliJob(job: StoredJob) {
    const source = await findWatchHistorySourceByType(job.userId, "tautulli");
    const metadata = parseTautulliWatchHistorySourceMetadata(
        parseWatchHistorySourceMetadataJson(source?.metadataJson),
    );

    if (!source || !metadata) {
        throw new Error(
            "Tautulli auto-sync requires an existing synced source with a saved user selection.",
        );
    }

    const tvResult = await syncTautulliWatchHistory(job.userId, {
        mediaType: "tv",
        tautulliUserId: metadata.selectedUserId,
        importLimit: metadata.importLimit,
    });

    if (!tvResult.ok) {
        throw new Error(tvResult.message);
    }

    const movieResult = await syncTautulliWatchHistory(job.userId, {
        mediaType: "movie",
        tautulliUserId: metadata.selectedUserId,
        importLimit: metadata.importLimit,
    });

    if (!movieResult.ok) {
        throw new Error(movieResult.message);
    }
}

async function runTraktJob(job: StoredJob) {
    const source = await findWatchHistorySourceByType(job.userId, "trakt");
    const metadata = parseTraktWatchHistorySourceMetadata(
        parseWatchHistorySourceMetadataJson(source?.metadataJson),
    );

    if (!source || !metadata) {
        throw new Error(
            "Trakt auto-sync requires an existing synced source with a saved import limit.",
        );
    }

    const tvResult = await syncTraktWatchHistory(job.userId, {
        mediaType: "tv",
        importLimit: metadata.importLimit,
    });

    if (!tvResult.ok) {
        throw new Error(tvResult.message);
    }

    const movieResult = await syncTraktWatchHistory(job.userId, {
        mediaType: "movie",
        importLimit: metadata.importLimit,
    });

    if (!movieResult.ok) {
        throw new Error(movieResult.message);
    }
}

async function runRecommendationJob(job: StoredJob) {
    if (job.targetType !== "recommendation-run") {
        throw new Error(`Unsupported recommendation job target type: ${job.targetType}.`);
    }

    const result = await executeQueuedRecommendationRunWorkflow(job.userId, job.targetKey);

    if (!result.ok) {
        throw new Error(result.message);
    }
}

async function runMediaLibraryScanJob(job: StoredJob) {
    if (
        job.targetType !== "media-library" ||
        (job.targetKey !== "all" && job.targetKey !== "manual")
    ) {
        throw new Error(
            `Unsupported media library scan target: ${job.targetType}:${job.targetKey}.`,
        );
    }

    await scanMediaLibraryWorkflow(job.userId, {});
}

async function runMissingContentSearchJob(job: StoredJob) {
    if (job.targetType !== "media-library" || job.targetKey !== "all") {
        throw new Error(
            `Unsupported missing-content search target: ${job.targetType}:${job.targetKey}.`,
        );
    }

    await searchMissingMonitoredContentWorkflow(job.userId);
}

async function runMetadataRefreshJob(job: StoredJob) {
    if (job.targetType !== "media-library" || job.targetKey !== "all") {
        throw new Error(`Unsupported metadata refresh target: ${job.targetType}:${job.targetKey}.`);
    }

    await refreshTvMetadataWorkflow(job.userId);
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function runDownloadImportJob(job: StoredJob) {
    const requestId =
        job.targetType === "download-request" && uuidPattern.test(job.targetKey)
            ? job.targetKey
            : null;
    const importsAll = job.targetType === "download-import" && job.targetKey === "all";

    if (!requestId && !importsAll) {
        throw new Error(`Unsupported download import target: ${job.targetType}:${job.targetKey}.`);
    }

    const input = requestId ? { requestId } : {};
    const result = await importCompletedEngineDownloadsWorkflow(job.userId, input, {
        onFilesystemProgress: createWorkerFilesystemProgressHeartbeat(),
    });

    if (!result) {
        if (requestId) {
            throw new Error(
                "The requested download was not found in completed downloader history.",
            );
        }

        return;
    }

    if (result.failedCount > 0) {
        throw new Error(
            `${result.failedCount} completed download import${result.failedCount === 1 ? "" : "s"} failed.`,
        );
    }

    if (requestId && result.matchedCount === 0) {
        throw new Error("The requested download was not found in completed downloader history.");
    }

    if (requestId && result.importedCount === 0) {
        throw new Error("The completed download was matched but no media files were imported.");
    }
}

async function runMediaTitleDeleteJob(job: StoredJob) {
    if (
        !["media-title", "media-title-preserve-files"].includes(job.targetType) ||
        !uuidPattern.test(job.targetKey)
    ) {
        throw new Error(
            `Unsupported media title deletion target: ${job.targetType}:${job.targetKey}.`,
        );
    }

    if (job.targetType === "media-title-preserve-files") {
        const result = await retireMediaTitlePreservingFilesWorkflow(job.userId, job.targetKey);

        if (result.status === "pending") {
            // Updating this unique immediate job while its lease is active creates a
            // deferred run. finishJobRun then keeps the intent enabled rather than
            // treating a normal cancellation wait as a failed one-shot operation.
            await createImmediateJob({
                userId: job.userId,
                jobType: "media-title-delete",
                targetType: job.targetType,
                targetKey: job.targetKey,
            });
        }

        return;
    }

    const result = await deleteMediaTitleWithFilesWorkflow(job.userId, {
        titleId: job.targetKey,
        deleteFiles: true,
    });
    const failedFiles = result.fileOutcomes.filter((outcome) => outcome.status === "failed");

    if (failedFiles.length > 0) {
        const examples = failedFiles
            .slice(0, 3)
            .map((outcome) => outcome.filePath)
            .join(", ");

        throw new Error(
            `${failedFiles.length} media file${failedFiles.length === 1 ? "" : "s"} could not be deleted${examples ? `: ${examples}` : "."}`,
        );
    }
}

async function executeJob(job: StoredJob) {
    if (job.jobType === "download-import") {
        return runDownloadImportJob(job);
    }

    if (job.jobType === "media-title-delete") {
        return runMediaTitleDeleteJob(job);
    }

    if (job.jobType === "recommendation-run") {
        return runRecommendationJob(job);
    }

    if (job.jobType === "media-library-scan") {
        return runMediaLibraryScanJob(job);
    }

    if (job.jobType === "missing-content-search") {
        return runMissingContentSearchJob(job);
    }

    if (job.jobType === "metadata-refresh") {
        return runMetadataRefreshJob(job);
    }

    if (job.jobType === "youtube-source-sync") {
        if (
            (job.targetType === "youtube" &&
                (job.targetKey === "all" || job.targetKey === "manual")) ||
            (job.targetType === "youtube-run-now" && job.targetKey.startsWith("all:"))
        ) {
            return syncAllActiveYouTubeSources();
        }

        if (job.targetType === "youtube-source") {
            return syncYouTubeSourceNow(job.userId, job.targetKey);
        }

        throw new Error(`Unsupported YouTube sync target: ${job.targetType}.`);
    }

    if (job.targetType !== "watch-history-source") {
        throw new Error(`Unsupported job target type: ${job.targetType}.`);
    }

    switch (job.targetKey) {
        case "plex":
            return runPlexJob(job);
        case "tautulli":
            return runTautulliJob(job);
        case "trakt":
            return runTraktJob(job);
        default:
            throw new Error(`Unsupported watch-history source: ${job.targetKey}.`);
    }
}

async function runCompletedDownloadImportPass() {
    const activeUserIds = await listUsersWithActiveDownloadRequestsForImport();
    const engineUserIds = await listUsersWithUnimportedFinishedEngineDownloads();
    const userIds = Array.from(new Set([...activeUserIds, ...engineUserIds]));
    const failures: string[] = [];
    const onFilesystemProgress = createWorkerFilesystemProgressHeartbeat();

    for (const userId of userIds) {
        // Each user is a completed unit of work. Recording it keeps a long pass
        // over many users from reading as a stalled worker, while a pass wedged
        // inside one user's import still goes stale — which is the signal the
        // filesystem-job carve-out below exists to preserve.
        recordWorkerProgress();

        try {
            await importCompletedEngineDownloadsWorkflow(userId, {}, { onFilesystemProgress });
        } catch (error) {
            // Engine imports retry on the next worker tick, but the failure remains
            // visible to operators instead of disappearing silently.
            const message = workerErrorMessage(error);

            failures.push(`engine import for ${userId}: ${message}`);
            logger.error("worker_engine_import_failed", { userId, error });
        }
    }

    if (failures.length > 0) {
        throw new Error(failures.join("; "));
    }
}

async function runMaintenancePass() {
    if (sharedWorkerState.runningMaintenance) {
        return;
    }

    sharedWorkerState.runningMaintenance = true;
    persistWorkerHealth();

    try {
        if (
            !sharedWorkerState.lastRetentionAt ||
            Date.now() - sharedWorkerState.lastRetentionAt.getTime() >= retentionIntervalMs
        ) {
            await pruneOperationalHistory();
            sharedWorkerState.lastRetentionAt = new Date();
            recordWorkerProgress();
        }

        // Progress is recorded between steps and inside the two long ones. The
        // maintenance pass regularly outlives backgroundWorkerStaleAfterMs — the
        // import sweep runs per user, and season
        // recovery runs indexer searches per fulfillment — and recording only at
        // the end made a busy worker look dead, taking /api/health to 503 and the
        // container to unhealthy. Deliberately not a timer: a wedged mount must
        // still surface, so only completed units count.
        await ensureEngineRunnerStarted();
        recordWorkerProgress();
        await ensureYouTubeRunnerStarted();
        recordWorkerProgress();
        await reconcilePendingSeasonFulfillmentCancellations();
        recordWorkerProgress();
        await reconcilePendingDownloadRequestCancellations();
        recordWorkerProgress();
        await runCompletedDownloadImportPass();
        recordWorkerProgress();
        await runDueSeasonFulfillments({ onProgress: () => recordWorkerProgress() });
    } finally {
        sharedWorkerState.runningMaintenance = false;
        recordWorkerProgress();
    }
}

async function runJobLane(jobType: JobType) {
    const activeJobTypes = sharedWorkerState.activeJobTypes!;

    if (activeJobTypes.has(jobType)) {
        return;
    }

    activeJobTypes.add(jobType);

    try {
        // Claim one job at a time per workload class. This avoids pre-claiming a
        // batch that would be stranded if the process exits before reaching it,
        // while still allowing unrelated classes to make progress concurrently.
        const [job] = await claimDueJobs(jobType, new Date(), 1);

        if (!job) {
            return;
        }

        const heartbeat = setInterval(() => {
            void heartbeatJobRun(job.id, job.runToken)
                .then((result) => {
                    // A lease heartbeat proves that long network/AI work still owns its
                    // job. Filesystem jobs require actual completion so a responsive JS
                    // timer cannot disguise a mount-blocked scan, import, or deletion.
                    if (result.changes > 0 && !filesystemJobTypes.has(job.jobType)) {
                        recordWorkerProgress();
                    }
                })
                .catch((error) => {
                    recordWorkerFailure(error, `lease heartbeat failed for job ${job.id}`);
                });
        }, jobHeartbeatIntervalMs);

        heartbeat.unref?.();

        try {
            await executeJob(job);
            await completeJobRun(job.id, job.runToken);
        } catch (error) {
            const message = workerErrorMessage(error);

            await failJobRun(job.id, job.runToken, message);

            if (job.jobType === "watch-history-sync") {
                await safeDispatchNotificationWorkflow({
                    userId: job.userId,
                    payload: {
                        eventType: "watch_history_sync_failed",
                        sourceLabel: job.targetKey,
                        message,
                    },
                });
            }

            throw error;
        } finally {
            clearInterval(heartbeat);
        }
    } finally {
        activeJobTypes.delete(jobType);
    }
}

const scheduledJobTypes: JobType[] = [
    // Filesystem lanes come first and are executed serially below. A wedged
    // mount must not be masked by heartbeat-producing network jobs.
    "download-import",
    "media-title-delete",
    "media-library-scan",
    "watch-history-sync",
    "recommendation-run",
    "missing-content-search",
    "metadata-refresh",
    "youtube-source-sync",
];
const preMaintenanceJobTypes = new Set<JobType>([
    "download-import",
    "media-title-delete",
    "media-library-scan",
]);

export async function runDueJobs() {
    // One pass owns the worker at a time. Most importantly, skipped timer ticks
    // do not refresh readiness while an earlier filesystem operation is hung.
    if (sharedWorkerState.runningPass || sharedWorkerState.stopping) {
        return;
    }

    const startedAt = new Date();

    sharedWorkerState.runningPass = true;
    sharedWorkerState.activePassStartedAt = startedAt;
    sharedWorkerState.lastProgressAt = startedAt;
    sharedWorkerState.lastTickAt = startedAt;
    persistWorkerHealth();

    try {
        // Filesystem lanes run serially before the generic maintenance sweep. In
        // particular, the sweep cannot consume a targeted import first, and a
        // wedged scan/import/delete cannot be hidden by an unrelated network-job
        // heartbeat. No other job lane overlaps maintenance.
        const preMaintenanceResults: PromiseSettledResult<void>[] = [];

        for (const jobType of scheduledJobTypes.filter((type) =>
            preMaintenanceJobTypes.has(type),
        )) {
            const [result] = await Promise.allSettled([
                runJobLane(jobType).finally(() => recordWorkerProgress()),
            ]);

            preMaintenanceResults.push(result);
        }

        const [maintenanceResult] = await Promise.allSettled([
            runMaintenancePass().finally(() => recordWorkerProgress()),
        ]);
        const jobResults = await Promise.allSettled(
            scheduledJobTypes
                .filter((jobType) => !preMaintenanceJobTypes.has(jobType))
                .map((jobType) => runJobLane(jobType).finally(() => recordWorkerProgress())),
        );
        const results = [...preMaintenanceResults, maintenanceResult, ...jobResults];
        const failures = results.filter(
            (result): result is PromiseRejectedResult => result.status === "rejected",
        );

        if (failures.length === 0) {
            sharedWorkerState.lastSuccessAt = new Date();
            sharedWorkerState.lastError = null;

            return;
        }

        for (const failure of failures) {
            recordWorkerFailure(failure.reason, "worker pass failed");
        }
    } finally {
        sharedWorkerState.runningPass = false;
        sharedWorkerState.activePassStartedAt = undefined;
        recordWorkerProgress();

        for (const resolve of sharedWorkerState.drainWaiters!) {
            resolve();
        }

        sharedWorkerState.drainWaiters!.clear();
    }
}

function runDueJobsSafely() {
    void runDueJobs().catch((error) => {
        // Every timer-triggered promise is observed so a transient database or
        // integration failure cannot become a process-level unhandled rejection.
        recordWorkerFailure(error, "worker pass failed");
    });
}

export function startBackgroundWorker(options: { keepProcessAlive?: boolean } = {}) {
    if (sharedWorkerState.started) {
        return;
    }

    const startedAt = new Date();

    sharedWorkerState.started = true;
    sharedWorkerState.stopping = false;
    sharedWorkerState.startedAt = startedAt;
    sharedWorkerState.lastProgressAt = startedAt;
    persistWorkerHealth();
    sharedWorkerState.timer = setInterval(() => {
        runDueJobsSafely();
    }, workerIntervalMs);

    if (!options.keepProcessAlive && typeof sharedWorkerState.timer.unref === "function") {
        sharedWorkerState.timer.unref();
    }

    runDueJobsSafely();
}

/**
 * Stop accepting new work and wait for the currently owned pass to reach a
 * durable job boundary. The outer process supervisor still has a hard kill
 * deadline for a genuinely wedged filesystem operation; healthy jobs are no
 * longer abandoned merely because SIGTERM arrived during shutdown.
 */
export async function stopBackgroundWorker() {
    if (sharedWorkerState.timer) {
        clearInterval(sharedWorkerState.timer);
    }

    sharedWorkerState.timer = undefined;
    sharedWorkerState.started = false;
    sharedWorkerState.stopping = true;
    recordWorkerProgress();

    if (sharedWorkerState.runningPass) {
        await new Promise<void>((resolve) => sharedWorkerState.drainWaiters!.add(resolve));
    }

    sharedWorkerState.stopping = false;
    sharedWorkerState.runningMaintenance = false;
    sharedWorkerState.activePassStartedAt = undefined;
    recordWorkerProgress();
}
