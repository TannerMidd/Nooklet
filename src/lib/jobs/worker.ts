import {
  claimDueJobs,
  completeJobRun,
  failJobRun,
  heartbeatJobRun,
  type StoredJob,
} from "@/modules/jobs/repositories/job-repository";
import { type JobType } from "@/lib/database/schema";
import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { listUsersWithUnimportedFinishedEngineDownloads } from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { ImportCompletedDownloadsWorkflowError } from "@/modules/downloads/workflows/import-completed-downloads/errors";
import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";
import { refreshTvMetadataWorkflow } from "@/modules/media-library/workflows/refresh-tv-metadata";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
import { searchMissingMonitoredContentWorkflow } from "@/modules/media-library/workflows/search-missing-monitored";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { parsePlexWatchHistorySourceMetadata } from "@/modules/watch-history/plex-watch-history-source-metadata";
import { executeQueuedRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";
import { parseWatchHistorySourceMetadataJson } from "@/modules/watch-history/source-metadata";
import { findWatchHistorySourceByType } from "@/modules/watch-history/queries/find-watch-history-source-by-type";
import { syncPlexWatchHistory } from "@/modules/watch-history/workflows/sync-plex-watch-history";
import { parseTautulliWatchHistorySourceMetadata } from "@/modules/watch-history/tautulli-watch-history-source-metadata";
import { syncTautulliWatchHistory } from "@/modules/watch-history/workflows/sync-tautulli-watch-history";
import { parseTraktWatchHistorySourceMetadata } from "@/modules/watch-history/trakt-watch-history-source-metadata";
import { syncTraktWatchHistory } from "@/modules/watch-history/workflows/sync-trakt-watch-history";

type WorkerState = {
  started?: boolean;
  runningMaintenance?: boolean;
  activeJobTypes?: Set<JobType>;
  timer?: NodeJS.Timeout;
  lastTickAt?: Date;
  lastSuccessAt?: Date;
  lastError?: string | null;
};

const workerGlobals = globalThis as typeof globalThis & {
  __nookletWorker?: WorkerState;
};

const sharedWorkerState = workerGlobals.__nookletWorker ?? {};
workerGlobals.__nookletWorker = sharedWorkerState;
sharedWorkerState.activeJobTypes ??= new Set<JobType>();

const workerIntervalMs = 15_000;
const jobHeartbeatIntervalMs = 60_000;

export type BackgroundWorkerHealth = {
  started: boolean;
  runningMaintenance: boolean;
  lastTickAt: Date | null;
  lastSuccessAt: Date | null;
  lastError: string | null;
};

export function getBackgroundWorkerHealth(): BackgroundWorkerHealth {
  return {
    started: sharedWorkerState.started === true,
    runningMaintenance: sharedWorkerState.runningMaintenance === true,
    lastTickAt: sharedWorkerState.lastTickAt ?? null,
    lastSuccessAt: sharedWorkerState.lastSuccessAt ?? null,
    lastError: sharedWorkerState.lastError ?? null,
  };
}

function workerErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Background worker failed unexpectedly.";
}

function recordWorkerFailure(error: unknown, context: string) {
  const message = workerErrorMessage(error);
  sharedWorkerState.lastError = `${context}: ${message}`;
  console.error(`[background-worker] ${context}:`, error);
}

async function runPlexJob(job: StoredJob) {
  const source = await findWatchHistorySourceByType(job.userId, "plex");
  const metadata = parsePlexWatchHistorySourceMetadata(
    parseWatchHistorySourceMetadataJson(source?.metadataJson),
  );

  if (!source || !metadata) {
    throw new Error("Plex auto-sync requires an existing synced source with a saved user selection.");
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
    throw new Error("Tautulli auto-sync requires an existing synced source with a saved user selection.");
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
    throw new Error("Trakt auto-sync requires an existing synced source with a saved import limit.");
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
  if (job.targetType !== "media-library" || job.targetKey !== "all") {
    throw new Error(`Unsupported media library scan target: ${job.targetType}:${job.targetKey}.`);
  }

  await scanMediaLibraryWorkflow(job.userId, {});
}

async function runMissingContentSearchJob(job: StoredJob) {
  if (job.targetType !== "media-library" || job.targetKey !== "all") {
    throw new Error(`Unsupported missing-content search target: ${job.targetType}:${job.targetKey}.`);
  }

  await searchMissingMonitoredContentWorkflow(job.userId);
}

async function runMetadataRefreshJob(job: StoredJob) {
  if (job.targetType !== "media-library" || job.targetKey !== "all") {
    throw new Error(`Unsupported metadata refresh target: ${job.targetType}:${job.targetKey}.`);
  }

  await refreshTvMetadataWorkflow(job.userId);
}

async function executeJob(job: StoredJob) {
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

  for (const userId of userIds) {
    // The built-in engine import never depends on SABnzbd being reachable,
    // so it runs first in its own failure domain.
    try {
      await importCompletedEngineDownloadsWorkflow(userId);
    } catch (error) {
      // Engine imports retry on the next worker tick, but the failure remains
      // visible to operators instead of disappearing silently.
      const message = workerErrorMessage(error);
      failures.push(`engine import for ${userId}: ${message}`);
      console.error(`[background-worker] engine import failed for user ${userId}:`, error);
    }

    try {
      // Order matters (legacy SABnzbd path):
      //  1. import-completed first so SAB-history items are matched and the corresponding
      //     download_requests are promoted to 'succeeded' before any reconciliation pass treats
      //     their queue rows as "missing". (SAB removes a queue slot the instant post-processing
      //     starts, so a just-completed item is absent from the queue snapshot before we have had
      //     a chance to import it.)
      //  2. duplicate-removal next so redundant active siblings are killed before the missing
      //     pass observes them, preventing a retry being scheduled for a sibling we are about to
      //     remove.
      //  3. missing-queue-retry last; only items genuinely gone from both queue and history will
      //     remain in the active set at this point.
      await importCompletedDownloadsWorkflow(userId);
      await reconcileDuplicateSabnzbdQueueItemsWorkflow(userId);
      await reconcileMissingSabnzbdQueueItemsWorkflow(userId);
    } catch (error) {
      // SABnzbd is an optional legacy integration. Built-in-engine requests
      // also appear in the active-request set, so an absent SAB connection is
      // a normal no-op rather than a failed maintenance pass.
      if (
        error instanceof ImportCompletedDownloadsWorkflowError
        && error.code === "sabnzbd_not_connected"
      ) {
        continue;
      }

      // Download imports retry on the next worker tick while the request remains active.
      const message = workerErrorMessage(error);
      failures.push(`SAB import/reconciliation for ${userId}: ${message}`);
      console.error(`[background-worker] SAB import/reconciliation failed for user ${userId}:`, error);
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

  try {
    await ensureEngineRunnerStarted();
    await runCompletedDownloadImportPass();
  } finally {
    sharedWorkerState.runningMaintenance = false;
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
      void heartbeatJobRun(job.id, job.runToken).catch((error) => {
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
  "watch-history-sync",
  "media-library-scan",
  "recommendation-run",
  "missing-content-search",
  "metadata-refresh",
];

export async function runDueJobs() {
  sharedWorkerState.lastTickAt = new Date();

  const results = await Promise.allSettled([
    runMaintenancePass(),
    ...scheduledJobTypes.map((jobType) => runJobLane(jobType)),
  ]);
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");

  if (failures.length === 0) {
    sharedWorkerState.lastSuccessAt = new Date();
    sharedWorkerState.lastError = null;
    return;
  }

  for (const failure of failures) {
    recordWorkerFailure(failure.reason, "worker pass failed");
  }
}

function runDueJobsSafely() {
  void runDueJobs().catch((error) => {
    // Every timer-triggered promise is observed so a transient database or
    // integration failure cannot become a process-level unhandled rejection.
    recordWorkerFailure(error, "worker pass failed");
  });
}

export function startBackgroundWorker() {
  if (sharedWorkerState.started) {
    return;
  }

  sharedWorkerState.started = true;
  sharedWorkerState.timer = setInterval(() => {
    runDueJobsSafely();
  }, workerIntervalMs);

  if (typeof sharedWorkerState.timer.unref === "function") {
    sharedWorkerState.timer.unref();
  }

  runDueJobsSafely();
}
