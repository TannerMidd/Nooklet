import {
  completeDownloadImportRun,
  createDownloadImportRun,
  recordDownloadImportedFile,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import { setTvEpisodeHasFile } from "@/modules/media-library/repositories/media-library-repository";
import { scheduleSeasonFulfillmentAfterRequest } from "@/modules/downloads/workflows/season-fulfillment-terminal-scheduling";
import {
  acquireSeasonFulfillmentWorkLease,
  isSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

import { type OrganizedCompletedDownload } from "./file-organization";
import { isRetryableCompletedMediaFailure } from "./file-inspection";

export type PersistedCompletedDownloadImports = {
  matchedCount: number;
  importedCount: number;
  failedCount: number;
  importedFileCount: number;
  affectedLibraryPathIds: string[];
};

function sourceRootPath(download: OrganizedCompletedDownload) {
  if (download.kind === "organized") {
    return download.source.source.sourceRootPath;
  }

  const inspectedSource = download.source.source;

  return inspectedSource.kind === "importable"
    ? inspectedSource.sourceRootPath
    : inspectedSource.match.historyItem.storagePath ?? inspectedSource.match.historyItem.title;
}

function requestAndQueue(download: OrganizedCompletedDownload) {
  return download.source.source.match;
}

export async function persistCompletedDownloadImports(
  userId: string,
  downloads: OrganizedCompletedDownload[],
  options: {
    workLeases?: ReadonlyMap<string, SeasonFulfillmentWorkLease>;
  } = {},
): Promise<PersistedCompletedDownloadImports> {
  const affectedLibraryPathIds = new Set<string>();
  let importedCount = 0;
  let failedCount = 0;
  let importedFileCount = 0;

  for (const download of downloads) {
    const match = requestAndQueue(download);
    const completedAt = match.historyItem.completedAt ?? new Date();
    const fulfillmentId = match.request.fulfillmentId;
    const suppliedLease = fulfillmentId
      ? options.workLeases?.get(fulfillmentId) ?? null
      : null;
    if (
      suppliedLease
      && fulfillmentId
      && !isSeasonFulfillmentWorkLease(suppliedLease, userId, fulfillmentId)
    ) {
      throw new Error("The completed-download import lease does not own this season.");
    }
    const workLease = fulfillmentId
      ? suppliedLease ?? await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId)
      : null;
    const releaseWhenDone = Boolean(workLease && !suppliedLease);
    if (match.request.fulfillmentId && !workLease) {
      throw new Error("Season recovery is already advancing; import persistence will retry.");
    }

    try {
    if (download.kind === "failed") {
      await scheduleSeasonFulfillmentAfterRequest(userId, match.request, {
        status: "failed",
        message: match.historyItem.failMessage ?? download.message,
        failureKind: match.historyItem.failureKind,
        retryableContentFailure: match.historyItem.statusKind === "failed"
          || isRetryableCompletedMediaFailure(download.message),
      }, { workLease: workLease ?? undefined });
      const libraryPathId = match.request.targetLibraryPathId;
      const importRun = await createDownloadImportRun({
        requestId: match.request.id,
        userId,
        libraryPathId,
        status: "running",
        sourceRootPath: sourceRootPath(download),
      });

      await completeDownloadImportRun({
        userId,
        importRunId: importRun.id,
        status: match.historyItem.statusKind === "failed" ? "skipped" : "failed",
        errorMessage: download.message,
        completedAt,
      });
      await updateDownloadQueueItemStatus({
        userId,
        queueItemId: match.queueItem.id,
        status: match.historyItem.statusKind === "failed" ? "failed" : "completed",
        completedAt,
      });
      await updateDownloadRequestStatus({
        userId,
        requestId: match.request.id,
        status: "failed",
        externalJobId: match.historyItem.id,
        statusMessage: download.message,
        completedAt,
      });
      failedCount += 1;
      continue;
    }

    const importRun = await createDownloadImportRun({
      requestId: match.request.id,
      userId,
      libraryPathId: download.source.source.target.path.id,
      status: "running",
      sourceRootPath: download.source.source.sourceRootPath,
      destinationRootPath: download.destinationRootPath,
    });

    const importedEpisodeIds = new Set<string>();

    for (const file of download.files) {
      await recordDownloadImportedFile({
        importRunId: importRun.id,
        userId,
        sourcePath: file.sourcePath,
        destinationPath: file.destinationPath,
      });

      if (file.episodeMatch?.episodeId) {
        importedEpisodeIds.add(file.episodeMatch.episodeId);
      }
    }

    // Mark matched episodes as owned immediately so monitoring automation
    // does not re-grab them before the post-import scan runs.
    for (const episodeId of importedEpisodeIds) {
      await setTvEpisodeHasFile({ episodeId, hasFile: true });
    }

    await scheduleSeasonFulfillmentAfterRequest(userId, match.request, {
      status: "succeeded",
      message: `Imported ${download.files.length} file${download.files.length === 1 ? "" : "s"}; verifying season coverage.`,
    }, { workLease: workLease ?? undefined });

    await completeDownloadImportRun({
      userId,
      importRunId: importRun.id,
      status: "succeeded",
      destinationRootPath: download.destinationRootPath,
      completedAt,
    });
    await updateDownloadQueueItemStatus({
      userId,
      queueItemId: match.queueItem.id,
      status: "completed",
      progressPercent: 100,
      completedAt,
    });
    await updateDownloadRequestStatus({
      userId,
      requestId: match.request.id,
      status: "succeeded",
      externalJobId: match.historyItem.id,
      statusMessage: `Imported ${download.files.length} file${download.files.length === 1 ? "" : "s"} into the library.`,
      completedAt,
    });

    importedCount += 1;
    importedFileCount += download.files.length;
    affectedLibraryPathIds.add(download.source.source.target.path.id);
    } finally {
      if (workLease && releaseWhenDone) {
        await releaseSeasonFulfillmentWorkLease(workLease);
      }
    }
  }

  return {
    matchedCount: downloads.length,
    importedCount,
    failedCount,
    importedFileCount,
    affectedLibraryPathIds: Array.from(affectedLibraryPathIds),
  };
}
