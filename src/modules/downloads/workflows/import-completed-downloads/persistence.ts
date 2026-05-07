import {
  completeDownloadImportRun,
  createDownloadImportRun,
  recordDownloadImportedFile,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";

import { type OrganizedCompletedDownload } from "./file-organization";

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
): Promise<PersistedCompletedDownloadImports> {
  const affectedLibraryPathIds = new Set<string>();
  let importedCount = 0;
  let failedCount = 0;
  let importedFileCount = 0;

  for (const download of downloads) {
    const match = requestAndQueue(download);
    const completedAt = match.historyItem.completedAt ?? new Date();

    if (download.kind === "failed") {
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

    for (const file of download.files) {
      await recordDownloadImportedFile({
        importRunId: importRun.id,
        userId,
        sourcePath: file.sourcePath,
        destinationPath: file.destinationPath,
      });
    }

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
  }

  return {
    matchedCount: downloads.length,
    importedCount,
    failedCount,
    importedFileCount,
    affectedLibraryPathIds: Array.from(affectedLibraryPathIds),
  };
}
