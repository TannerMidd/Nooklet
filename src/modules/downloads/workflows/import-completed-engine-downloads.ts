import { rm } from "node:fs/promises";

import {
    annotateDownloadRequestStatusMessage,
    findDownloadClientByServiceConnectionId,
    findDownloadRequestById,
    listDownloadQueueItemsForRequest,
    listDownloadRequestsForExternalQueueIds,
    listDownloadRequestsForExternalQueueIdsForImport,
    listActiveDownloadRequestsForImport,
    updateDownloadQueueItemStatus,
    updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
    findEngineDownloadById,
    listUnimportedFinishedEngineDownloads,
    markEngineDownloadImported,
} from "@/modules/download-engine/queue/engine-repository";
import { engineIncompleteDir } from "@/modules/download-engine/runtime/engine-runner";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { recordCompletedDownloadImportAudit } from "./import-completed-downloads/audit";
import { resolveCompletedDownloadDestinations } from "./import-completed-downloads/destination-resolution";
import { inspectCompletedDownloadFiles } from "./import-completed-downloads/file-inspection";
import { organizeCompletedDownloadFiles } from "./import-completed-downloads/file-organization";
import { type ImportFilesystemProgressReporter } from "./import-completed-downloads/file-transfer";
import { dispatchCompletedDownloadNotifications } from "./import-completed-downloads/notifications";
import {
    type FinishedDownloadRecord,
    type MatchedCompletedDownload,
} from "./import-completed-downloads/request-matching";
import { persistCompletedDownloadImports } from "./import-completed-downloads/persistence";
import { retryFailedCompletedDownloads } from "./import-completed-downloads/retry-handling";
import { triggerCompletedDownloadDiscovery } from "./import-completed-downloads/scan-trigger";
import { acquireSeasonImportFences } from "./import-completed-downloads/season-import-fence";
import { withCompletedImportLock } from "./completed-import-lock";

export type ImportCompletedEngineDownloadsInput = {
    requestId?: string;
};

export type ImportCompletedEngineDownloadsOptions = {
    onFilesystemProgress?: ImportFilesystemProgressReporter;
};

/**
 * Removes the durable artifact before consuming its engine row. A transient
 * filesystem failure deliberately leaves `importedAt` unset so the worker can
 * retry cleanup in the same process on a later import pass.
 */
async function consumeFinishedEngineDownload(id: string, artifactPath: string | null) {
    if (artifactPath) {
        try {
            await rm(artifactPath, { recursive: true, force: true });
        } catch {
            return false;
        }
    }

    await markEngineDownloadImported(id);

    return true;
}

/**
 * Import pass for the built-in download engine. The engine writes finished
 * downloads to a local output directory and records their terminal state, so
 * this workflow maps terminal engine rows into the shared import phase shape:
 * destination resolution,
 * media-file inspection, organization into library folders, persistence,
 * retry scheduling, and library-scan triggering.
 */
async function runImportCompletedEngineDownloadsWorkflow(
    userId: string,
    input: ImportCompletedEngineDownloadsInput = {},
    options: ImportCompletedEngineDownloadsOptions = {},
) {
    const usenetServer = await findServiceConnectionByType(userId, "usenet-server");

    // Safety net: an active request whose engine download no longer exists
    // (removed from the queue, or lost to a crash between writes) must not
    // stay "queued" forever — close it out with a visible reason.
    if (!input.requestId && usenetServer) {
        const nookletClient = await findDownloadClientByServiceConnectionId(
            userId,
            usenetServer.connection.id,
        );

        if (nookletClient) {
            for (const entry of await listActiveDownloadRequestsForImport(
                userId,
                nookletClient.id,
            )) {
                const engineDownload = await findEngineDownloadById(
                    userId,
                    entry.queueItem.externalQueueId,
                );

                // A transfer the engine parked because the news server was
                // unreachable stays active and resumable, but nothing else carries
                // that reason onto the request — the activity list would otherwise
                // show it downloading with no explanation.
                if (
                    engineDownload &&
                    engineDownload.state === "paused" &&
                    engineDownload.failureKind === "infrastructure" &&
                    engineDownload.errorMessage
                ) {
                    await annotateDownloadRequestStatusMessage({
                        userId,
                        requestId: entry.request.id,
                        statusMessage: engineDownload.errorMessage,
                    });
                    continue;
                }

                if (!engineDownload) {
                    const message =
                        "The download is no longer in the queue — it was removed or lost.";
                    const seasonFulfillment = await scheduleSeasonFulfillmentAfterRequest(
                        userId,
                        entry.request,
                        {
                            status: "failed",
                            message,
                            retryableContentFailure: true,
                        },
                    );

                    if (
                        seasonFulfillment?.cancellationRequestedAt ||
                        seasonFulfillment?.status === "cancelled"
                    ) {
                        // The cancellation reconciler still needs this queue id to retry
                        // deterministic directory cleanup. Do not hide it behind a local
                        // failed status merely because the engine row is already gone.
                        continue;
                    }

                    await updateDownloadQueueItemStatus({
                        userId,
                        queueItemId: entry.queueItem.id,
                        status: "failed",
                        completedAt: new Date(),
                    });
                    await updateDownloadRequestStatus({
                        userId,
                        requestId: entry.request.id,
                        status: "failed",
                        statusMessage: message,
                    });

                    if (!seasonFulfillment && entry.request.status !== "failed") {
                        await safeDispatchNotificationWorkflow({
                            userId,
                            payload: {
                                eventType: "download_failed",
                                title: entry.request.requestedTitle,
                                mediaType: entry.request.mediaType,
                                message,
                            },
                        });
                    }
                }
            }
        }
    }

    const targetRequest = input.requestId
        ? await findDownloadRequestById(userId, input.requestId)
        : null;
    const targetQueueItems =
        targetRequest && !targetRequest.cancellationRequestedAt
            ? await listDownloadQueueItemsForRequest(userId, targetRequest.id)
            : [];
    const targetQueueIds = new Set(targetQueueItems.map((item) => item.externalQueueId));
    const allFinished = await listUnimportedFinishedEngineDownloads(userId);
    const finished = input.requestId
        ? allFinished.filter((record) => targetQueueIds.has(record.id))
        : allFinished;

    if (finished.length === 0) {
        return null;
    }

    const historyById = new Map<string, FinishedDownloadRecord>(
        finished.map((record) => [
            record.id,
            {
                id: record.id,
                title: record.name,
                status: record.state,
                category: record.category,
                storagePath: record.outputPath,
                completedAt: record.completedAt,
                failMessage:
                    record.state === "failed"
                        ? (record.errorMessage ?? "The download failed.")
                        : null,
                failureKind: record.failureKind,
                downloadedBytes: record.downloadedBytes,
                sizeLabel: null,
                totalMb: record.totalBytes > 0 ? record.totalBytes / (1024 * 1024) : null,
                statusKind: record.state === "failed" ? "failed" : "completed",
            },
        ]),
    );

    // Match by the engine id itself rather than a mutable connection/client id.
    // This keeps completed local files importable after a connection is
    // removed and recreated.
    const activeRequests = input.requestId
        ? targetRequest
            ? targetQueueItems.map((queueItem) => ({ request: targetRequest, queueItem }))
            : []
        : await listDownloadRequestsForExternalQueueIdsForImport(
              userId,
              finished.map((record) => record.id),
          );
    const trackedRequests = input.requestId
        ? activeRequests
        : await listDownloadRequestsForExternalQueueIds(
              userId,
              finished.map((record) => record.id),
          );
    const matches: MatchedCompletedDownload[] = activeRequests.flatMap((entry) => {
        const historyItem = historyById.get(entry.queueItem.externalQueueId);

        return historyItem ? [{ ...entry, historyItem }] : [];
    });

    const fences = await acquireSeasonImportFences(userId, matches);
    let organized;
    let persisted;

    try {
        const resolved = await resolveCompletedDownloadDestinations(userId, fences.matches);
        const inspected = await inspectCompletedDownloadFiles(resolved);

        await fences.renew();
        organized = await organizeCompletedDownloadFiles(inspected, {
            onFilesystemProgress: options.onFilesystemProgress,
        });
        await fences.renew();
        persisted = await persistCompletedDownloadImports(userId, organized, {
            workLeases: fences.workLeases,
            requestWorkLeases: fences.requestWorkLeases,
        });
    } finally {
        await fences.release();
    }

    const matchedEngineIds = new Set(fences.matches.map((match) => match.historyItem.id));
    const retry = await retryFailedCompletedDownloads(userId, organized);
    const discovery = await triggerCompletedDownloadDiscovery(userId, persisted);

    // Failed transfers are terminal once their request state/retry decision was
    // persisted. Completed transfers are consumed only after a successful
    // import; retryable import failures deliberately remain unconsumed.
    for (const record of finished) {
        const tracked = trackedRequests.find(
            (entry) => entry.queueItem.externalQueueId === record.id,
        );

        if (record.state === "failed") {
            const requestAfterImport = tracked
                ? await findDownloadRequestById(userId, tracked.request.id)
                : null;
            const terminalRequest =
                !tracked ||
                !requestAfterImport ||
                ["failed", "succeeded", "cancelled"].includes(requestAfterImport.status);

            if (terminalRequest) {
                await consumeFinishedEngineDownload(record.id, engineIncompleteDir(record.id));
            }

            continue;
        }

        const matchedRequest = matches.find((match) => match.historyItem.id === record.id);

        if (matchedRequest) {
            const requestAfterImport = await findDownloadRequestById(
                userId,
                matchedRequest.request.id,
            );

            if (requestAfterImport?.status === "succeeded") {
                await consumeFinishedEngineDownload(record.id, record.outputPath);
            }

            continue;
        }

        // Failed imports deliberately fall out of the eligible query during the
        // retry cooldown. Preserve their source instead of mistaking that window
        // for an orphan. Only terminal success/cancellation or no tracking row is
        // safe to consume here.
        if (!tracked || ["succeeded", "cancelled"].includes(tracked.request.status)) {
            await consumeFinishedEngineDownload(record.id, record.outputPath);
        }
    }

    if (matchedEngineIds.size > 0) {
        await recordCompletedDownloadImportAudit({ userId, persisted, retry, discovery });
    }

    await dispatchCompletedDownloadNotifications(userId, organized);

    return { ...persisted, retry, discovery };
}

export async function importCompletedEngineDownloadsWorkflow(
    userId: string,
    input: ImportCompletedEngineDownloadsInput = {},
    options: ImportCompletedEngineDownloadsOptions = {},
) {
    return withCompletedImportLock(userId, () =>
        runImportCompletedEngineDownloadsWorkflow(userId, input, options),
    );
}
