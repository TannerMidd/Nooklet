import { rm } from "node:fs/promises";

import {
  findDownloadClientByServiceConnectionId,
  findDownloadRequestById,
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
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { recordCompletedDownloadImportAudit } from "./import-completed-downloads/audit";
import { resolveCompletedDownloadDestinations } from "./import-completed-downloads/destination-resolution";
import { inspectCompletedDownloadFiles } from "./import-completed-downloads/file-inspection";
import { organizeCompletedDownloadFiles } from "./import-completed-downloads/file-organization";
import { type FinishedSabnzbdHistoryItem } from "./import-completed-downloads/history-fetch";
import { dispatchCompletedDownloadNotifications } from "./import-completed-downloads/notifications";
import { type MatchedCompletedDownload } from "./import-completed-downloads/request-matching";
import { persistCompletedDownloadImports } from "./import-completed-downloads/persistence";
import { retryFailedCompletedDownloads } from "./import-completed-downloads/retry-handling";
import { triggerCompletedDownloadDiscovery } from "./import-completed-downloads/scan-trigger";
import { withCompletedImportLock } from "./completed-import-lock";

/**
 * Import pass for the built-in download engine. The engine writes finished
 * downloads to a local output directory and records their terminal state, so
 * this workflow synthesizes the same "finished history" shape the SABnzbd
 * import phases consume and reuses them wholesale: destination resolution,
 * media-file inspection, organization into library folders, persistence,
 * retry scheduling, and library-scan triggering.
 */
async function runImportCompletedEngineDownloadsWorkflow(userId: string) {
  const usenetServer = await findServiceConnectionByType(userId, "usenet-server");

  // Safety net: an active request whose engine download no longer exists
  // (removed from the queue, or lost to a crash between writes) must not
  // stay "queued" forever — close it out with a visible reason.
  if (usenetServer) {
    const nookletClient = await findDownloadClientByServiceConnectionId(userId, usenetServer.connection.id);

    if (nookletClient) {
      for (const entry of await listActiveDownloadRequestsForImport(userId, nookletClient.id)) {
        const engineDownload = await findEngineDownloadById(userId, entry.queueItem.externalQueueId);

        if (!engineDownload) {
          const message = "The download is no longer in the queue — it was removed or lost.";
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
          if (entry.request.status !== "failed") {
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

  const finished = await listUnimportedFinishedEngineDownloads(userId);

  if (finished.length === 0) {
    return null;
  }
  const historyById = new Map<string, FinishedSabnzbdHistoryItem>(finished.map((record) => [
    record.id,
    {
      id: record.id,
      title: record.name,
      status: record.state,
      category: record.category,
      storagePath: record.outputPath,
      completedAt: record.completedAt,
      failMessage: record.state === "failed"
        ? record.errorMessage ?? "The download failed."
        : null,
      sizeLabel: null,
      totalMb: record.totalBytes > 0 ? record.totalBytes / (1024 * 1024) : null,
      statusKind: record.state === "failed" ? "failed" : "completed",
    },
  ]));

  // Match by the engine id itself rather than a mutable connection/client id.
  // This keeps completed local files importable after a connection is
  // removed and recreated.
  const activeRequests = await listDownloadRequestsForExternalQueueIdsForImport(
    userId,
    finished.map((record) => record.id),
  );
  const trackedRequests = await listDownloadRequestsForExternalQueueIds(
    userId,
    finished.map((record) => record.id),
  );
  const matches: MatchedCompletedDownload[] = activeRequests.flatMap((entry) => {
    const historyItem = historyById.get(entry.queueItem.externalQueueId);

    return historyItem ? [{ ...entry, historyItem }] : [];
  });

  const matchedEngineIds = new Set(matches.map((match) => match.historyItem.id));

  const resolved = await resolveCompletedDownloadDestinations(userId, matches, { sourcePathKind: "local" });
  const inspected = await inspectCompletedDownloadFiles(resolved);
  const organized = await organizeCompletedDownloadFiles(inspected);
  const persisted = await persistCompletedDownloadImports(userId, organized);
  const retry = await retryFailedCompletedDownloads(userId, organized);
  const discovery = await triggerCompletedDownloadDiscovery(userId, persisted);

  // Failed transfers are terminal once their request state/retry decision was
  // persisted. Completed transfers are consumed only after a successful
  // import; retryable import failures deliberately remain unconsumed.
  for (const record of finished) {
    if (record.state === "failed") {
      await markEngineDownloadImported(record.id);
      await rm(engineIncompleteDir(record.id), { recursive: true, force: true }).catch(() => undefined);
      continue;
    }

    const matchedRequest = matches.find((match) => match.historyItem.id === record.id);

    if (matchedRequest) {
      const requestAfterImport = await findDownloadRequestById(userId, matchedRequest.request.id);

      if (requestAfterImport?.status === "succeeded") {
        await markEngineDownloadImported(record.id);

        if (record.outputPath) {
          await rm(record.outputPath, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      continue;
    }

    const tracked = trackedRequests.find(
      (entry) => entry.queueItem.externalQueueId === record.id,
    );

    // Failed imports deliberately fall out of the eligible query during the
    // retry cooldown. Preserve their source instead of mistaking that window
    // for an orphan. Only terminal success/cancellation or no tracking row is
    // safe to consume here.
    if (!tracked || ["succeeded", "cancelled"].includes(tracked.request.status)) {
      await markEngineDownloadImported(record.id);

      if (record.outputPath) {
        await rm(record.outputPath, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  if (matchedEngineIds.size > 0) {
    await recordCompletedDownloadImportAudit({ userId, persisted, retry, discovery });
  }
  await dispatchCompletedDownloadNotifications(userId, organized);

  return { ...persisted, retry, discovery };
}

export async function importCompletedEngineDownloadsWorkflow(userId: string) {
  return withCompletedImportLock(userId, () => runImportCompletedEngineDownloadsWorkflow(userId));
}
