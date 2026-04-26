import {
  claimDueJobs,
  completeJobRun,
  failJobRun,
  type StoredJob,
} from "@/modules/jobs/repositories/job-repository";
import { parsePlexWatchHistorySourceMetadata } from "@/modules/watch-history/plex-watch-history-source-metadata";
import { executeQueuedRecommendationRunWorkflow } from "@/modules/recommendations/workflows/create-recommendation-run";
import { parseWatchHistorySourceMetadataJson } from "@/modules/watch-history/source-metadata";
import { findWatchHistorySourceByType } from "@/modules/watch-history/repositories/watch-history-repository";
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
  __recommendarrWorker?: WorkerState;
};

const sharedWorkerState = workerGlobals.__recommendarrWorker ?? {};
workerGlobals.__recommendarrWorker = sharedWorkerState;

const workerIntervalMs = 60_000;

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

async function executeJob(job: StoredJob) {
  if (job.jobType === "recommendation-run") {
    return runRecommendationJob(job);
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

async function runDueJobs() {
  if (sharedWorkerState.running) {
    return;
  }

  sharedWorkerState.running = true;

  try {
    const dueJobs = [
      ...(await claimDueJobs("watch-history-sync", new Date(), 4)),
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