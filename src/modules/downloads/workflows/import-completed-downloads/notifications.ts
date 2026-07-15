import { findActiveDownloadRequestForItem } from "@/modules/downloads/repositories/download-repository";
import { safeDispatchNotificationWorkflow } from "@/modules/notifications/workflows/dispatch-notification";

import { type OrganizedCompletedDownload } from "./file-organization";

type NotificationDispatchSummary = {
  completedCount: number;
  downloadFailedCount: number;
  importFailedCount: number;
  suppressedRetryCount: number;
};

function matchFor(download: OrganizedCompletedDownload) {
  return download.source.source.match;
}

function itemKey(download: OrganizedCompletedDownload) {
  const request = matchFor(download).request;

  if (!request.mediaTitleId) {
    return `request:${request.id}`;
  }

  return `${request.mediaTitleId}:${request.episodeId ?? request.seasonId ?? "title"}`;
}

/**
 * Sends lifecycle outcomes only after persistence and automatic release retry
 * decisions have completed. A failed request being reprocessed already has a
 * `failed` source status, so it is deliberately ignored to avoid one alert on
 * every worker pass. Successful siblings also take precedence over duplicate
 * failed queue entries for the same title or episode.
 */
export async function dispatchCompletedDownloadNotifications(
  userId: string,
  downloads: OrganizedCompletedDownload[],
): Promise<NotificationDispatchSummary> {
  const grouped = new Map<string, OrganizedCompletedDownload[]>();

  for (const download of downloads) {
    const key = itemKey(download);
    grouped.set(key, [...(grouped.get(key) ?? []), download]);
  }

  const summary: NotificationDispatchSummary = {
    completedCount: 0,
    downloadFailedCount: 0,
    importFailedCount: 0,
    suppressedRetryCount: 0,
  };

  for (const group of grouped.values()) {
    const successful = group.filter((download) => download.kind === "organized");

    if (successful.length > 0) {
      const match = matchFor(successful[0]!);
      const importedFileCount = new Set(successful.flatMap((download) => (
        download.kind === "organized"
          ? download.files.map((file) => file.destinationPath)
          : []
      ))).size;

      await safeDispatchNotificationWorkflow({
        userId,
        payload: {
          eventType: "download_import_succeeded",
          title: match.request.requestedTitle,
          mediaType: match.request.mediaType,
          fileCount: importedFileCount,
        },
      });
      summary.completedCount += 1;
      continue;
    }

    const failure = group.find((download) => (
      download.kind === "failed" && matchFor(download).request.status !== "failed"
    ));

    if (!failure || failure.kind !== "failed") {
      continue;
    }

    const match = matchFor(failure);
    const request = match.request;

    if (request.mediaTitleId) {
      const replacement = await findActiveDownloadRequestForItem({
        userId,
        mediaTitleId: request.mediaTitleId,
        episodeId: request.episodeId,
        seasonId: request.seasonId,
      });

      if (replacement) {
        summary.suppressedRetryCount += 1;
        continue;
      }
    }

    const transferFailed = match.historyItem.statusKind === "failed";

    await safeDispatchNotificationWorkflow({
      userId,
      payload: {
        eventType: transferFailed ? "download_failed" : "download_import_failed",
        title: request.requestedTitle,
        mediaType: request.mediaType,
        message: failure.message,
      },
    });

    if (transferFailed) {
      summary.downloadFailedCount += 1;
    } else {
      summary.importFailedCount += 1;
    }
  }

  return summary;
}
