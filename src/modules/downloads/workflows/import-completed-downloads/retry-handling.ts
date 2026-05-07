import { listDownloadRequestSearchResultIdsForItem } from "@/modules/downloads/repositories/download-repository";
import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { type MatchedCompletedDownload } from "./request-matching";
import { noMediaFilesFoundMessage } from "./file-inspection";
import { type OrganizedCompletedDownload } from "./file-organization";

export type CompletedDownloadRetryResult = {
  attemptedCount: number;
  queuedCount: number;
  failedCount: number;
};

function retryableFailureMatch(download: OrganizedCompletedDownload): MatchedCompletedDownload | null {
  if (download.kind !== "failed") {
    return null;
  }

  const inspected = download.source;

  if (inspected.kind === "ready") {
    return null;
  }

  if (inspected.source.kind === "failed") {
    return inspected.source.match.historyItem.statusKind === "failed" ? inspected.source.match : null;
  }

  return download.message === noMediaFilesFoundMessage
    ? inspected.source.match
    : null;
}

export async function retryFailedCompletedDownloads(
  userId: string,
  downloads: OrganizedCompletedDownload[],
): Promise<CompletedDownloadRetryResult> {
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;

  for (const download of downloads) {
    const match = retryableFailureMatch(download);

    if (!match?.request.mediaTitleId) {
      continue;
    }

    attemptedCount += 1;

    try {
      const excludedResultIds = await listDownloadRequestSearchResultIdsForItem({
        userId,
        mediaTitleId: match.request.mediaTitleId,
        episodeId: match.request.episodeId,
      });
      const retry = await searchLibraryItemReleasesWorkflow(userId, {
        titleId: match.request.mediaTitleId,
        episodeId: match.request.episodeId ?? undefined,
        targetLibraryPathId: match.request.targetLibraryPathId,
        excludedResultIds,
      });

      if (retry.queuedDownload.queued) {
        queuedCount += 1;
      } else {
        failedCount += 1;
      }
    } catch {
      failedCount += 1;
    }
  }

  return { attemptedCount, queuedCount, failedCount };
}
