import { readdir, rm } from "node:fs/promises";
import path from "node:path";

import { type EngineDownloadFailureKind, type EngineDownloadState } from "@/lib/database/schema";
import { withDownloadAdmissionFence } from "@/lib/download-admission";
import { env } from "@/lib/env";
import { logger } from "@/lib/observability/logger";
import { SafeFetchAbortError, SsrfBlockedError } from "@/lib/security/safe-fetch";
import {
    resolveUsenetServer,
    UsenetServerConfigError,
} from "@/modules/download-engine/config/resolve-usenet-server";
import {
    finalizeDownload,
    FinalizeDownloadError,
} from "@/modules/download-engine/finalize/finalize-download";
import { parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
    claimQueuedEngineDownload,
    deleteCancelledEngineDownload,
    listEngineDownloadsWithControlIntent,
    markEngineDownloadWaitingForCapacity,
    peekNextQueuedEngineDownload,
    readEngineDownloadRuntimeState,
    recoverStrandedEngineDownloads,
    resolveEngineDownloadPayload,
    setEngineDownloadState,
    transitionEngineDownloadState,
    type EngineDownloadRecord,
    updateEngineDownloadProgress,
} from "@/modules/download-engine/queue/engine-repository";
import { listEngineDownloadArtifactStates } from "@/modules/download-engine/runtime/engine-artifact-repository";
import { inspectLiveEngineCapacity } from "@/modules/download-engine/runtime/live-capacity";
import {
    recordDownloadEngineLoopFailed,
    recordDownloadEngineLoopStarted,
    recordDownloadEngineLoopSucceeded,
} from "@/modules/download-engine/runtime/engine-heartbeat";
import { fetchingStageBudgetForBytes } from "@/modules/download-engine/runtime/stage-budget";
import { downloadNzb } from "@/modules/download-engine/scheduler/download-nzb";
import { NntpError, type NntpErrorKind } from "@/modules/download-engine/nntp/nntp-client";

/**
 * The isolated worker owns this process-local runner. Queue controls and UI
 * telemetry live in SQLite so web requests never depend on this process's
 * memory and survive worker restarts.
 */
type EngineRuntimeState = {
    running?: boolean;
    recovered?: boolean;
    activeDownloadId?: string;
};

const engineGlobals = globalThis as typeof globalThis & {
    __nookletEngine?: EngineRuntimeState;
};

const runtime: EngineRuntimeState = engineGlobals.__nookletEngine ?? {};

engineGlobals.__nookletEngine = runtime;

// Keep this set string-compatible so the runtime slice can compile against
// older NNTP unions while recognizing newer protocol classifications when the
// NNTP slice supplies them.
const infrastructureNntpFailureKinds = new Set<string>([
    "connect-failed",
    "auth-failed",
    "protocol-error",
    "server-unavailable",
    "timeout",
    "connection-closed",
]);

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
    failureKinds: readonly string[],
): EngineDownloadFailureKind {
    return failureKinds.some((kind) => infrastructureNntpFailureKinds.has(kind))
        ? "infrastructure"
        : "content";
}

export function classifyEngineRuntimeError(
    error: unknown,
    transferFailureKinds: readonly string[] = [],
): EngineDownloadFailureKind {
    if (classifyEngineNntpFailureKinds(transferFailureKinds) === "infrastructure") {
        return "infrastructure";
    }

    if (error instanceof NntpError) {
        return infrastructureNntpFailureKinds.has(error.kind) ? "infrastructure" : "content";
    }

    if (
        error instanceof UsenetServerConfigError ||
        error instanceof SafeFetchAbortError ||
        error instanceof SsrfBlockedError
    ) {
        return "infrastructure";
    }

    if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        typeof error.code === "string" &&
        infrastructureSystemErrorCodes.has(error.code)
    ) {
        return "infrastructure";
    }

    // Finalization knows whether the release or our own post-processing tooling
    // was at fault; only the former may blocklist the release.
    return error instanceof FinalizeDownloadError ? error.kind : "unknown";
}

export function engineIncompleteDir(downloadId: string) {
    return path.join(env.DOWNLOAD_ENGINE_WORK_DIR, "incomplete", downloadId);
}

export function engineCompleteDir(downloadId: string) {
    return path.join(env.DOWNLOAD_ENGINE_DIR, "complete", downloadId);
}

type SpeedSample = {
    bytesPerSecond: number;
    lastBytes: number;
    lastAt: number;
};

function trackSpeed(current: SpeedSample | null, downloadedBytes: number) {
    const now = Date.now();

    if (!current) {
        return {
            sample: { bytesPerSecond: 0, lastBytes: downloadedBytes, lastAt: now },
            bytesPerSecond: 0,
        };
    }

    const elapsedMs = now - current.lastAt;

    if (elapsedMs < 1_000) {
        return { sample: current, bytesPerSecond: Math.round(current.bytesPerSecond) };
    }

    const deltaBytes = downloadedBytes - current.lastBytes;
    const instantRate = (deltaBytes * 1000) / elapsedMs;

    current.bytesPerSecond =
        current.bytesPerSecond === 0
            ? instantRate
            : current.bytesPerSecond * 0.6 + instantRate * 0.4;
    current.lastBytes = downloadedBytes;
    current.lastAt = now;

    return { sample: current, bytesPerSecond: Math.round(current.bytesPerSecond) };
}

async function cleanCancelledEngineDownload(download: Pick<EngineDownloadRecord, "id" | "userId">) {
    await rm(engineIncompleteDir(download.id), { recursive: true, force: true });
    await rm(engineCompleteDir(download.id), { recursive: true, force: true });

    const deleted = await deleteCancelledEngineDownload(download.userId, download.id);
    const current = deleted ? null : readEngineDownloadRuntimeState(download.id);

    if (current?.controlIntent === "cancel") {
        throw new Error("The cancelled engine download changed before cleanup could be finalized.");
    }
}

export async function reconcilePendingEngineCancellations() {
    const cancellations = await listEngineDownloadsWithControlIntent("cancel");

    for (const download of cancellations) {
        // The active loop observes the same durable intent between segments and
        // owns cleanup. Never remove its directories concurrently.
        if (download.id === runtime.activeDownloadId) {
            continue;
        }

        await cleanCancelledEngineDownload(download);
    }
}

async function settleEngineControl(download: EngineDownloadRecord) {
    const current = readEngineDownloadRuntimeState(download.id);

    if (!current) {
        // A legacy/concurrent owner may have removed the row. No output may be
        // published after ownership disappears.
        await rm(engineIncompleteDir(download.id), { recursive: true, force: true });
        await rm(engineCompleteDir(download.id), { recursive: true, force: true });

        return true;
    }

    if (current.controlIntent === "cancel") {
        await cleanCancelledEngineDownload(download);

        return true;
    }

    if (current.controlIntent === "pause") {
        const paused = await setEngineDownloadState(
            download.id,
            "paused",
            {},
            {
                expectedStates: [current.state],
                controlIntent: "pause",
                clearControlIntent: true,
            },
        );

        if (paused) {
            return true;
        }

        // Cancellation is allowed to supersede a pending pause. Re-read after a
        // lost compare-and-swap so we never report the control as settled while a
        // newer intent is still waiting for cleanup.
        const latest = readEngineDownloadRuntimeState(download.id);

        if (!latest) {
            await rm(engineIncompleteDir(download.id), { recursive: true, force: true });
            await rm(engineCompleteDir(download.id), { recursive: true, force: true });

            return true;
        }

        if (latest.controlIntent === "cancel") {
            await cleanCancelledEngineDownload(download);

            return true;
        }

        return false;
    }

    return false;
}

async function failEngineDownload(
    download: EngineDownloadRecord,
    expectedStates: EngineDownloadState[],
    failureKind: EngineDownloadFailureKind,
    errorMessage: string,
) {
    const failed = await setEngineDownloadState(
        download.id,
        "failed",
        { failureKind, errorMessage, completedAt: new Date() },
        { expectedStates, controlIntent: null },
    );

    if (!failed) {
        await settleEngineControl(download);
    }
}

/**
 * Parks a transfer the news server prevented from finishing.
 *
 * `failed` is terminal, and terminal states wipe the stored NZB while
 * `resumePausedEngineDownload` only accepts `paused` — so the "then resume
 * this download" these failures have always printed was never actually
 * possible. Parking makes it true: the payload survives, the existing resume
 * action works, and the release is not blocklisted for the server's outage.
 *
 * Only the fetching phase is parked. Post-processing failures stay terminal
 * because finalized output cannot be resumed as a download; commit 3 already
 * keeps those from being blamed on the release.
 */
async function parkEngineDownload(download: EngineDownloadRecord, errorMessage: string) {
    const parked = await setEngineDownloadState(
        download.id,
        "paused",
        { failureKind: "infrastructure", errorMessage },
        { expectedStates: ["fetching"], controlIntent: null },
    );

    if (!parked) {
        await settleEngineControl(download);
    }
}

const capacityWaitMessage =
    "Waiting for enough free space in the download workspace. Nooklet will check again automatically.";
const capacityUncheckableMessage =
    "The download workspace could not be checked. Nooklet will try again automatically.";

/**
 * Wall-clock budget for one download's fetching stage.
 *
 * The engine is serial, so a server that responds just fast enough to reset
 * every per-read timeout while never finishing an article could otherwise hold
 * the entire queue indefinitely. The budget scales with payload size on top of
 * a fixed floor, mirroring the health diagnostics' size-aware stall windows;
 * `DOWNLOAD_STAGE_BUDGET_MS` replaces the derivation entirely for tests and
 * unusual links. Exceeding it parks the download for resume — it is never
 * treated as a release fault.
 */
export function fetchingStageBudgetMs(totalBytes: number): number {
    return fetchingStageBudgetForBytes(totalBytes, env.DOWNLOAD_STAGE_BUDGET_MS);
}

async function processEngineDownload(download: EngineDownloadRecord): Promise<"continue" | "stop"> {
    const workDir = engineIncompleteDir(download.id);
    let transferFailureKinds: NntpErrorKind[] = [];
    let speedSample: SpeedSample | null = null;
    let latestBytesPerSecond: number | null = null;

    runtime.activeDownloadId = download.id;

    try {
        const payload = resolveEngineDownloadPayload(download);
        const resolvedServer = await resolveUsenetServer(download.userId);

        if (!resolvedServer) {
            await failEngineDownload(
                download,
                ["fetching"],
                "infrastructure",
                "No usenet server is configured. Add one under Settings → Connections.",
            );

            return "continue";
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
            deadlineAt: Date.now() + fetchingStageBudgetMs(download.totalBytes),
            onProgress: (progress) => {
                const trackedSpeed = trackSpeed(speedSample, progress.downloadedBytes);

                speedSample = trackedSpeed.sample;
                latestBytesPerSecond = trackedSpeed.bytesPerSecond;
                const now = Date.now();

                if (now - lastPersistAt >= 1_000) {
                    lastPersistAt = now;
                    // Serialize writes so an older progress snapshot cannot overwrite a
                    // newer one and capture failures for the runner's main control flow.
                    progressPersistence = progressPersistence.then(async () => {
                        if (progressPersistenceError) {
                            return;
                        }

                        try {
                            await updateEngineDownloadProgress(download.id, {
                                downloadedBytes: progress.downloadedBytes,
                                completedSegments: progress.completedSegments,
                                failedSegments: progress.failedSegments,
                                bytesPerSecond: trackedSpeed.bytesPerSecond,
                            });
                        } catch (error) {
                            progressPersistenceError = error;
                        }
                    });
                }
            },
            shouldAbort: () => {
                const current = readEngineDownloadRuntimeState(download.id);

                return !current || current.state !== "fetching" || current.controlIntent !== null;
            },
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
            bytesPerSecond: latestBytesPerSecond,
        });

        if (await settleEngineControl(download)) {
            return "continue";
        }

        // Checked before the generic abort handling: an overrun sets both
        // flags, and it must park with its infrastructure message rather than
        // degrade into an unexplained pause. Explicit user controls never
        // reach either branch — they are settled by settleEngineControl above.
        if (result.deadlineExceeded) {
            await parkEngineDownload(
                download,
                "The transfer exceeded its time budget without finishing, usually because the news server is very slow. Resume to restart this download.",
            );

            return "continue";
        }

        if (result.aborted) {
            const paused = await setEngineDownloadState(
                download.id,
                "paused",
                {},
                { expectedStates: ["fetching"], controlIntent: null },
            );

            if (!paused) {
                await settleEngineControl(download);
            }

            return "continue";
        }

        const failureKind = classifyEngineNntpFailureKinds(result.failureKinds);

        // Checked before `unrecoverable` so a broken server is never reported as a
        // damaged release: that verdict blocklists the release and sends the
        // caller hunting through every other candidate for the same episode.
        //
        // Genuine transport kinds reach `transportExhausted`, while any explicit
        // infrastructure kind reaches the second arm. Articles that arrive but
        // will not decode are `article-unusable` and spend the release's own
        // recovery budget instead. Keep this guard independent of
        // `completedSegments`: a deterministic protocol response can arrive after
        // earlier segments succeeded, but it still says nothing about the
        // release's health.
        if (result.transportExhausted || failureKind === "infrastructure") {
            await parkEngineDownload(
                download,
                "The news server kept failing on articles this release does have. Check the Usenet connection, then resume this download.",
            );

            return "continue";
        }

        if (result.unrecoverable) {
            await failEngineDownload(
                download,
                ["fetching"],
                failureKind,
                "The transfer stopped early: more of the release's articles are missing or damaged than its PAR2 recovery set can repair, so it can never assemble completely.",
            );

            return "continue";
        }

        if (result.completedSegments === 0) {
            await failEngineDownload(
                download,
                ["fetching"],
                failureKind,
                "No article could be fetched from the news server — the post may have been removed.",
            );

            return "continue";
        }

        const postProcessState = result.ok ? "extracting" : "repairing";
        const claimedPostProcessing = await transitionEngineDownloadState(
            download.userId,
            download.id,
            ["fetching"],
            postProcessState,
            { controlIntent: null },
        );

        if (!claimedPostProcessing) {
            await settleEngineControl(download);

            return "continue";
        }

        const finalized = await finalizeDownload({
            workDir,
            outputDir: engineCompleteDir(download.id),
            downloadName: download.name,
            files: result.files,
            password: payload.password,
        });

        const completed = await setEngineDownloadState(
            download.id,
            "completed",
            {
                failureKind: null,
                outputPath: finalized.outputPath,
                errorMessage: finalized.warnings.length > 0 ? finalized.warnings.join(" ") : null,
                completedAt: new Date(),
            },
            { expectedStates: [postProcessState], controlIntent: null },
        );

        if (!completed) {
            await settleEngineControl(download);
        }

        return "continue";
    } catch (error) {
        if (await settleEngineControl(download)) {
            return "continue";
        }

        const message =
            error instanceof FinalizeDownloadError
                ? error.message
                : error instanceof Error
                  ? error.message
                  : "The download failed unexpectedly.";

        await failEngineDownload(
            download,
            ["fetching", "repairing", "extracting"],
            classifyEngineRuntimeError(error, transferFailureKinds),
            message,
        );

        return "continue";
    } finally {
        if (runtime.activeDownloadId === download.id) {
            runtime.activeDownloadId = undefined;
        }
    }
}

async function runEngineLoop() {
    try {
        recordDownloadEngineLoopStarted();
    } catch (error) {
        logger.error("download_engine_loop_start_persistence_failed", { error });
    }

    try {
        // Downloads passed over this pass because they do not currently fit. They
        // stay queued in priority order; skipping keeps one oversized release from
        // blocking every smaller one behind it.
        const deferred = new Set<string>();

        for (;;) {
            const candidate = await peekNextQueuedEngineDownload([...deferred]);

            if (!candidate) {
                break;
            }

            const admission = await withDownloadAdmissionFence(async () => {
                try {
                    const capacity = await inspectLiveEngineCapacity(candidate);

                    if (!capacity.sufficient) {
                        return { kind: "insufficient" as const };
                    }

                    return {
                        kind: "claimed" as const,
                        download: await claimQueuedEngineDownload(candidate.id),
                    };
                } catch {
                    return { kind: "uncheckable" as const };
                }
            });

            if (admission.kind === "uncheckable") {
                // Nothing was claimed, so there is nothing to unwind — but record why
                // the queue is not moving before giving the pass up.
                await markEngineDownloadWaitingForCapacity(
                    candidate.id,
                    capacityUncheckableMessage,
                );
                break;
            }

            if (admission.kind === "insufficient") {
                await markEngineDownloadWaitingForCapacity(candidate.id, capacityWaitMessage);
                deferred.add(candidate.id);
                continue;
            }

            const download = admission.download;

            if (!download) {
                // Paused, cancelled or claimed elsewhere between the peek and the
                // claim. Skip it so the loop cannot spin on the same row.
                deferred.add(candidate.id);
                continue;
            }

            const disposition = await processEngineDownload(download);

            if (disposition === "stop") {
                break;
            }
        }

        try {
            recordDownloadEngineLoopSucceeded();
        } catch (error) {
            logger.error("download_engine_loop_success_persistence_failed", { error });
        }
    } catch (error) {
        try {
            recordDownloadEngineLoopFailed(error);
        } catch (heartbeatError) {
            logger.error("download_engine_loop_failure_persistence_failed", {
                error: heartbeatError,
            });
        }

        throw error;
    } finally {
        runtime.running = false;
    }
}

/**
 * Parks interrupted work once per worker process. The worker entrypoint calls
 * this before accepting filesystem jobs so a slow scan cannot leave an old
 * transfer looking active or eligible for an automatic restart.
 */
export async function recoverInterruptedEngineDownloads() {
    if (!runtime.recovered) {
        await recoverStrandedEngineDownloads();
        // Runs after the state recovery so rows this pass just parked are
        // already visible in their terminal-ish state when directories are
        // judged orphaned.
        const sweepCompleted = await sweepOrphanedEngineArtifacts();

        // Only latch recovery after every eligible artifact was removed. A
        // transient filesystem failure must be retried on the next worker tick.
        if (sweepCompleted) {
            runtime.recovered = true;
        }
    }
}

const engineActiveArtifactStates = new Set<EngineDownloadState>([
    "fetching",
    "repairing",
    "extracting",
]);

async function safeReadDir(dir: string) {
    try {
        return await readdir(dir, { withFileTypes: true });
    } catch (error) {
        if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            (error as { code: unknown }).code === "ENOENT"
        ) {
            return [];
        }

        throw error;
    }
}

/**
 * Reclaims disk space from engine directories whose download can never use
 * them again.
 *
 * Crash windows otherwise leak both ways: a stranded `fetching` row leaves its
 * incomplete assembly behind forever unless the user resumes it, and a crash
 * between finalize output and the `completed` CAS — or a failed download whose
 * finalized output was never imported — leaves a complete directory no import
 * pass will ever consume. The rules mirror ownership, not progress:
 *
 * - `incomplete/<id>` belongs to an active transfer; anything else is swept.
 * - `complete/<id>` survives only for rows that still owe an import
 *   (`completed && !importedAt`) or defensively hold declared output. A
 *   missing row, an already-imported or failed row, or a queued/paused row
 *   without output is swept.
 */
export async function sweepOrphanedEngineArtifacts() {
    const rows = await listEngineDownloadArtifactStates();
    const rowById = new Map(rows.map((row) => [row.id, row]));

    const incompleteDir = path.join(env.DOWNLOAD_ENGINE_WORK_DIR, "incomplete");
    const completeDir = path.join(env.DOWNLOAD_ENGINE_DIR, "complete");

    let removedIncomplete = 0;
    let removedComplete = 0;
    let failedRemovals = 0;

    const remove = async (target: string) => {
        try {
            await rm(target, { recursive: true, force: true });

            return true;
        } catch (error) {
            logger.warn("download_engine_artifact_removal_failed", { path: target, error });

            failedRemovals += 1;

            return false;
        }
    };

    for (const entry of await safeReadDir(incompleteDir)) {
        const row = rowById.get(entry.name);

        if (runtime.activeDownloadId === entry.name) {
            continue;
        }

        if (row && engineActiveArtifactStates.has(row.state)) {
            continue;
        }

        if (await remove(path.join(incompleteDir, entry.name))) {
            removedIncomplete += 1;
        }
    }

    for (const entry of await safeReadDir(completeDir)) {
        if (runtime.activeDownloadId === entry.name) {
            continue;
        }

        const row = rowById.get(entry.name);
        const stillOwned = Boolean(
            row &&
            row.importedAt === null &&
            (engineActiveArtifactStates.has(row.state) ||
                row.state === "completed" ||
                ((row.state === "queued" || row.state === "paused") && row.outputPath !== null)),
        );

        if (stillOwned) {
            continue;
        }

        if (await remove(path.join(completeDir, entry.name))) {
            removedComplete += 1;
        }
    }

    if (removedIncomplete > 0 || removedComplete > 0) {
        logger.info("download_engine_artifact_sweep_completed", {
            removedIncomplete,
            removedComplete,
        });
    }

    return failedRemovals === 0;
}

/** Reconciles cancellation intent and starts one drain loop per worker. */
export async function ensureEngineRunnerStarted() {
    await reconcilePendingEngineCancellations();
    await recoverInterruptedEngineDownloads();

    if (runtime.running) {
        return;
    }

    runtime.running = true;
    void runEngineLoop().catch((error) => {
        logger.error("download_engine_runner_stopped", { error });
    });
}
