import { rm } from "node:fs/promises";

import {
  createDownloadClient,
  findDownloadClientByServiceConnectionId,
  findDownloadRequestById,
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
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { recordCompletedDownloadImportAudit } from "./import-completed-downloads/audit";
import { resolveCompletedDownloadDestinations } from "./import-completed-downloads/destination-resolution";
import { inspectCompletedDownloadFiles } from "./import-completed-downloads/file-inspection";
import { organizeCompletedDownloadFiles } from "./import-completed-downloads/file-organization";
import { type FinishedSabnzbdHistoryItem } from "./import-completed-downloads/history-fetch";
import { type MatchedCompletedDownload } from "./import-completed-downloads/request-matching";
import { persistCompletedDownloadImports } from "./import-completed-downloads/persistence";
import { retryFailedCompletedDownloads } from "./import-completed-downloads/retry-handling";
import { triggerCompletedDownloadDiscovery } from "./import-completed-downloads/scan-trigger";

/**
 * Import pass for the built-in download engine. The engine writes finished
 * downloads to a local output directory and records their terminal state, so
 * this workflow synthesizes the same "finished history" shape the SABnzbd
 * import phases consume and reuses them wholesale: destination resolution,
 * media-file inspection, organization into library folders, persistence,
 * retry scheduling, and library-scan triggering.
 */
export async function importCompletedEngineDownloadsWorkflow(userId: string) {
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
            statusMessage: "The download is no longer in the queue — it was removed or lost.",
          });
        }
      }
    }
  }

  const finished = await listUnimportedFinishedEngineDownloads(userId);

  if (finished.length === 0) {
    return null;
  }


  if (!usenetServer) {
    // Engine downloads exist but the connection was removed; nothing can be
    // matched to a client anymore, so park them as imported to stop the loop.
    for (const record of finished) {
      await markEngineDownloadImported(record.id);
    }

    return null;
  }

  const client = await findDownloadClientByServiceConnectionId(userId, usenetServer.connection.id)
    ?? await createDownloadClient({
      userId,
      serviceConnectionId: usenetServer.connection.id,
      clientType: "nooklet",
      displayName: "Nooklet downloader",
      status: "verified",
      isDefault: true,
    });

  if (!client) {
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

  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.id);
  const matches: MatchedCompletedDownload[] = activeRequests.flatMap((entry) => {
    const historyItem = historyById.get(entry.queueItem.externalQueueId);

    return historyItem ? [{ ...entry, historyItem }] : [];
  });

  const matchedEngineIds = new Set(matches.map((match) => match.historyItem.id));

  const resolved = await resolveCompletedDownloadDestinations(userId, matches);
  const inspected = await inspectCompletedDownloadFiles(resolved);
  const organized = await organizeCompletedDownloadFiles(inspected);
  const persisted = await persistCompletedDownloadImports(userId, organized);
  const retry = await retryFailedCompletedDownloads(userId, organized);
  const discovery = await triggerCompletedDownloadDiscovery(userId, persisted);

  // Every finished download is consumed exactly once: matched ones after
  // their import ran, unmatched ones (request removed/cancelled) immediately.
  for (const record of finished) {
    await markEngineDownloadImported(record.id);

    // Reclaim disk space. Failed downloads keep nothing (their working dir
    // is abandoned mid-flight); completed ones drop their output dir once
    // the matched request actually imported its files into the library.
    if (record.state === "failed") {
      await rm(engineIncompleteDir(record.id), { recursive: true, force: true }).catch(() => undefined);
      continue;
    }

    const matchedRequest = matches.find((match) => match.historyItem.id === record.id);

    if (matchedRequest && record.outputPath) {
      const requestAfterImport = await findDownloadRequestById(userId, matchedRequest.request.id);

      if (requestAfterImport?.status === "succeeded") {
        await rm(record.outputPath, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  if (matchedEngineIds.size > 0) {
    await recordCompletedDownloadImportAudit({ userId, persisted, retry, discovery });
  }

  return { ...persisted, retry, discovery };
}
