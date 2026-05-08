import {
  claimDueJobs,
  completeJobRun,
  failJobRun,
  type StoredJob,
} from "@/modules/jobs/repositories/job-repository";
import { listUsersWithActiveDownloadRequestsForImport } from "@/modules/downloads/queries/list-users-with-active-download-requests";
import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";
import { scanMediaLibraryWorkflow } from "@/modules/media-library/workflows/scan-library";
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
  running?: boolean;
  timer?: NodeJS.Timeout;
};

const workerGlobals = globalThis as typeof globalThis & {
  __nookletWorker?: WorkerState;
};

const sharedWorkerState = workerGlobals.__nookletWorker ?? {};
workerGlobals.__nookletWorker = sharedWorkerState;

const workerIntervalMs = 15_000;

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

async function executeJob(job: StoredJob) {
  if (job.jobType === "recommendation-run") {
    return runRecommendationJob(job);
  }

  if (job.jobType === "media-library-scan") {
    return runMediaLibraryScanJob(job);
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
  const userIds = await listUsersWithActiveDownloadRequestsForImport();

  for (const userId of userIds) {
    try {
      await importCompletedDownloadsWorkflow(userId);
      await reconcileMissingSabnzbdQueueItemsWorkflow(userId);
      await reconcileDuplicateSabnzbdQueueItemsWorkflow(userId);
    } catch {
      // Download imports retry on the next worker tick while the request remains active.
    }
  }
}

export async function runDueJobs() {
  if (sharedWorkerState.running) {
    return;
  }

  sharedWorkerState.running = true;

  try {
    await runCompletedDownloadImportPass();

    const dueJobs = [
      ...(await claimDueJobs("watch-history-sync", new Date(), 4)),
      ...(await claimDueJobs("media-library-scan", new Date(), 2)),
      ...(await claimDueJobs("recommendation-run", new Date(), 2)),
    ];

    for (const job of dueJobs) {
      try {
        await executeJob(job);
        await completeJobRun(job.id, job.scheduleMinutes);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Background job failed unexpectedly.";
        await failJobRun(job.id, job.scheduleMinutes, message);
      }
    }
  } finally {
    sharedWorkerState.running = false;
  }
}

export function startBackgroundWorker() {
  if (sharedWorkerState.started) {
    return;
  }

  sharedWorkerState.started = true;
  sharedWorkerState.timer = setInterval(() => {
    void runDueJobs();
  }, workerIntervalMs);

  if (typeof sharedWorkerState.timer.unref === "function") {
    sharedWorkerState.timer.unref();
  }

  void runDueJobs();
}