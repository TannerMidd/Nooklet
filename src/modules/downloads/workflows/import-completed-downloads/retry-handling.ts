import { listDownloadRequestReleaseExclusionsForItem } from "@/modules/downloads/repositories/download-repository";
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

function matchItemKey(match: MatchedCompletedDownload) {
  if (!match.request.mediaTitleId) {
    return null;
  }

  return `${match.request.mediaTitleId}:${match.request.episodeId ?? "movie"}`;
}

function importedItemKeys(downloads: OrganizedCompletedDownload[]) {
  return new Set(downloads.flatMap((download) => {
    if (download.kind !== "organized") {
      return [];
    }

    const key = matchItemKey(download.source.source.match);

    return key ? [key] : [];
  }));
}

export async function retryFailedCompletedDownloads(
  userId: string,
  downloads: OrganizedCompletedDownload[],
): Promise<CompletedDownloadRetryResult> {
  let attemptedCount = 0;
  let queuedCount = 0;
  let failedCount = 0;
  const retriedItemKeys = new Set<string>();
  const successfulItemKeys = importedItemKeys(downloads);

  for (const download of downloads) {
    const match = retryableFailureMatch(download);

    if (!match) {
      continue;
    }

    const mediaTitleId = match.request.mediaTitleId;
    const itemKey = matchItemKey(match);

    if (!mediaTitleId || !itemKey || retriedItemKeys.has(itemKey) || successfulItemKeys.has(itemKey)) {
      continue;
    }

    retriedItemKeys.add(itemKey);

    attemptedCount += 1;

    try {
      const exclusions = await listDownloadRequestReleaseExclusionsForItem({
        userId,
        mediaTitleId,
        episodeId: match.request.episodeId,
        seasonId: match.request.seasonId,
      });
      const retry = await searchLibraryItemReleasesWorkflow(userId, {
        titleId: mediaTitleId,
        episodeId: match.request.episodeId ?? undefined,
        targetLibraryPathId: match.request.targetLibraryPathId,
        excludedResultIds: exclusions.resultIds,
        excludedReleaseKeys: exclusions.releaseKeys,
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
