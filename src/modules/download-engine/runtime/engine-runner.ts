import path from "node:path";
import { rm } from "node:fs/promises";

import { type EngineDownloadFailureKind } from "@/lib/database/schema";
import { env } from "@/lib/env";
import {
  resolveUsenetServer,
  UsenetServerConfigError,
} from "@/modules/download-engine/config/resolve-usenet-server";
import { finalizeDownload, FinalizeDownloadError } from "@/modules/download-engine/finalize/finalize-download";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
  claimNextQueuedEngineDownload,
  setEngineDownloadState,
  updateEngineDownloadProgress,
  requeueStrandedEngineDownloads,
  resolveEngineDownloadPayload,
  type EngineDownloadRecord,
  transitionEngineDownloadState,
} from "@/modules/download-engine/queue/engine-repository";
import { downloadNzb } from "@/modules/download-engine/scheduler/download-nzb";
import { NntpError, type NntpErrorKind } from "@/modules/download-engine/nntp/nntp-client";
import { SafeFetchAbortError, SsrfBlockedError } from "@/lib/security/safe-fetch";

/**
 * In-process engine runner (ADR-0002). The background worker tick calls
 * `ensureEngineRunnerStarted()`; the runner then drains the queued downloads
 * one at a time on a long-lived async loop, holding NNTP connections open for
 * the duration of each transfer. Process-wide singleton, same pattern as the
 * job worker.
 */

type EngineControlSignal = "pause" | "cancel";

type EngineRuntimeState = {
  running?: boolean;
  recovered?: boolean;
  controls?: Map<string, EngineControlSignal>;
  /** Rolling transfer-rate samples for the active download. */
  speed?: { downloadId: string; bytesPerSecond: number; lastBytes: number; lastAt: number } | null;
};

const engineGlobals = globalThis as typeof globalThis & {
  __nookletEngine?: EngineRuntimeState;
};

const runtime: EngineRuntimeState = engineGlobals.__nookletEngine ?? {};
engineGlobals.__nookletEngine = runtime;
runtime.controls = runtime.controls ?? new Map();

const infrastructureNntpFailureKinds: NntpErrorKind[] = [
  "connect-failed",
  "auth-failed",
  "timeout",
  "connection-closed",
];

const infrastructureSystemErrorCodes = new Set([
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
  "ENOSPC",
  "EACCES",
  "EPERM",
  "EROFS",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

export function classifyEngineNntpFailureKinds(
  failureKinds: readonly NntpErrorKind[],
): EngineDownloadFailureKind {
  return failureKinds.some((kind) => infrastructureNntpFailureKinds.includes(kind))
    ? "infrastructure"
    : "content";
}

export function classifyEngineRuntimeError(
  error: unknown,
  transferFailureKinds: readonly NntpErrorKind[] = [],
): EngineDownloadFailureKind {
  if (classifyEngineNntpFailureKinds(transferFailureKinds) === "infrastructure") {
    return "infrastructure";
  }

  if (error instanceof NntpError) {
    return infrastructureNntpFailureKinds.includes(error.kind) ? "infrastructure" : "content";
  }

  if (
    error instanceof UsenetServerConfigError
    || error instanceof SafeFetchAbortError
    || error instanceof SsrfBlockedError
  ) {
    return "infrastructure";
  }

  if (
    error
    && typeof error === "object"
    && "code" in error
    && typeof error.code === "string"
    && infrastructureSystemErrorCodes.has(error.code)
  ) {
    return "infrastructure";
  }

  return error instanceof FinalizeDownloadError ? "content" : "unknown";
}

export function engineIncompleteDir(downloadId: string) {
  return path.join(env.DOWNLOAD_ENGINE_DIR, "incomplete", downloadId);
}

export function engineCompleteDir(downloadId: string) {
  return path.join(env.DOWNLOAD_ENGINE_DIR, "complete", downloadId);
}

export function signalEngineDownload(downloadId: string, signal: EngineControlSignal) {
  runtime.controls!.set(downloadId, signal);
}

export function clearEngineDownloadSignal(downloadId: string) {
  runtime.controls!.delete(downloadId);
}

/** Bytes/second for the currently transferring download, if it matches. */
export function getEngineDownloadSpeed(downloadId: string): number | null {
  const speed = runtime.speed;

  return speed && speed.downloadId === downloadId ? Math.round(speed.bytesPerSecond) : null;
}

function trackSpeed(downloadId: string, downloadedBytes: number) {
  const now = Date.now();
  const current = runtime.speed;

  if (!current || current.downloadId !== downloadId) {
    runtime.speed = { downloadId, bytesPerSecond: 0, lastBytes: downloadedBytes, lastAt: now };
    return;
  }

  const elapsedMs = now - current.lastAt;

  if (elapsedMs < 1_000) {
    return;
  }

  const deltaBytes = downloadedBytes - current.lastBytes;
  const instantRate = (deltaBytes * 1000) / elapsedMs;
  // Exponential smoothing keeps the displayed speed stable.
  current.bytesPerSecond = current.bytesPerSecond === 0
    ? instantRate
    : current.bytesPerSecond * 0.6 + instantRate * 0.4;
  current.lastBytes = downloadedBytes;
  current.lastAt = now;
}

async function processEngineDownload(download: EngineDownloadRecord) {
  const workDir = engineIncompleteDir(download.id);
  let transferFailureKinds: NntpErrorKind[] = [];

  try {
    const payload = resolveEngineDownloadPayload(download);
    const resolvedServer = await resolveUsenetServer(download.userId);

    if (!resolvedServer) {
      await setEngineDownloadState(download.id, "failed", {
        failureKind: "infrastructure",
        errorMessage: "No usenet server is configured. Add one under Settings → Connections.",
        completedAt: new Date(),
      });
      return;
    }

    const nzb = parseNzb(payload.nzbXml);

    // Fresh-start semantics: a claimed download always begins from a clean
    // working directory (per-segment resume is future work per ADR-0002).
    await rm(workDir, { recursive: true, force: true });

    let lastPersistAt = 0;
    let progressPersistence = Promise.resolve();
    let progressPersistenceError: unknown = null;
    const result = await downloadNzb({
      nzb,
      server: resolvedServer.server,
      workDir,
      onProgress: (progress) => {
        trackSpeed(download.id, progress.downloadedBytes);
        const now = Date.now();

        if (now - lastPersistAt >= 1_000) {
          lastPersistAt = now;
          // Serialize writes so a slower earlier update cannot overwrite a
          // newer progress snapshot. Capture failures for the main control
          // flow instead of creating an unhandled promise rejection.
          progressPersistence = progressPersistence.then(async () => {
            if (progressPersistenceError) {
              return;
            }

            try {
              await updateEngineDownloadProgress(download.id, {
                downloadedBytes: progress.downloadedBytes,
                completedSegments: progress.completedSegments,
                failedSegments: progress.failedSegments,
              });
            } catch (error) {
              progressPersistenceError = error;
            }
          });
        }
      },
      shouldAbort: () => runtime.controls!.has(download.id),
    });
    transferFailureKinds = result.failureKinds;

    await progressPersistence;
    if (progressPersistenceError) {
      throw progressPersistenceError;
    }

    await updateEngineDownloadProgress(download.id, {
      downloadedBytes: result.downloadedBytes,
      completedSegments: result.completedSegments,
      failedSegments: result.failedSegments,
    });

    const signal = runtime.controls!.get(download.id);
    runtime.controls!.delete(download.id);

    if (signal === "cancel") {
      await rm(workDir, { recursive: true, force: true });
      // The queue action already deleted (or will delete) the row; if it
      // still exists mark it failed so nothing dangles.
      await setEngineDownloadState(download.id, "failed", {
        failureKind: "cancelled",
        errorMessage: "Cancelled.",
        completedAt: new Date(),
      });
      return;
    }

    if (signal === "pause" || result.aborted) {
      await setEngineDownloadState(download.id, "paused");
      return;
    }

    if (result.completedSegments === 0) {
      const failureKind = classifyEngineNntpFailureKinds(result.failureKinds);
      await setEngineDownloadState(download.id, "failed", {
        failureKind,
        errorMessage: failureKind === "infrastructure"
          ? "The built-in downloader could not reach or authenticate with the news server. Check the Usenet connection, then resume this download."
          : "No article could be fetched from the news server — the post may have been removed.",
        completedAt: new Date(),
      });
      return;
    }

    if (result.unrecoverable) {
      const failureKind = classifyEngineNntpFailureKinds(result.failureKinds);
      await setEngineDownloadState(download.id, "failed", {
        failureKind,
        errorMessage: failureKind === "infrastructure"
          ? "The transfer stopped early because the news server kept failing mid-download. Check the Usenet connection, then resume this download."
          : "The transfer stopped early: more articles are missing or damaged than the release's PAR2 recovery set can repair, so it can never assemble completely.",
        completedAt: new Date(),
      });
      return;
    }

    const lateSignal = runtime.controls!.get(download.id);
    if (lateSignal) {
      runtime.controls!.delete(download.id);
      if (lateSignal === "cancel") {
        await rm(workDir, { recursive: true, force: true });
        await setEngineDownloadState(download.id, "failed", {
          failureKind: "cancelled",
          errorMessage: "Cancelled.",
          completedAt: new Date(),
        });
      } else {
        await setEngineDownloadState(download.id, "paused");
      }
      return;
    }

    const postProcessState = result.ok ? "extracting" : "repairing";
    const claimedPostProcessing = await transitionEngineDownloadState(
      download.userId,
      download.id,
      ["fetching"],
      postProcessState,
    );
    if (!claimedPostProcessing) {
      // A cancellation may delete the row after the signal check. The
      // fetching->post-process CAS is the durable acknowledgement: without
      // it, no output is allowed to finalize.
      runtime.controls!.delete(download.id);
      await rm(workDir, { recursive: true, force: true });
      await rm(engineCompleteDir(download.id), { recursive: true, force: true });
      return;
    }

    const finalized = await finalizeDownload({
      workDir,
      outputDir: engineCompleteDir(download.id),
      downloadName: download.name,
      files: result.files,
      password: payload.password,
    });

    await setEngineDownloadState(download.id, "completed", {
      failureKind: null,
      outputPath: finalized.outputPath,
      errorMessage: finalized.warnings.length > 0 ? finalized.warnings.join(" ") : null,
      completedAt: new Date(),
    });
  } catch (error) {
    const message = error instanceof FinalizeDownloadError
      ? error.message
      : error instanceof Error
        ? error.message
        : "The download failed unexpectedly.";

    await setEngineDownloadState(download.id, "failed", {
      failureKind: classifyEngineRuntimeError(error, transferFailureKinds),
      errorMessage: message,
      completedAt: new Date(),
    });
  } finally {
    if (runtime.speed?.downloadId === download.id) {
      runtime.speed = null;
    }
  }
}

async function runEngineLoop() {
  try {
    for (;;) {
      const download = await claimNextQueuedEngineDownload();

      if (!download) {
        break;
      }

      await processEngineDownload(download);
    }
  } finally {
    runtime.running = false;
  }
}

/**
 * Called from the worker tick. Recovers stranded rows once per process, then
 * starts the drain loop when queued work exists and no loop is running.
 */
export async function ensureEngineRunnerStarted() {
  if (!runtime.recovered) {
    runtime.recovered = true;
    await requeueStrandedEngineDownloads();
  }

  if (runtime.running) {
    return;
  }

  runtime.running = true;
  void runEngineLoop().catch((error) => {
    // A database/claim failure is retried by the next maintenance tick, but
    // the promise must always be observed to avoid destabilizing the process.
    console.error("[download-engine] runner stopped unexpectedly:", error);
  });
}
