import {
  completeMediaScanRun,
  createMediaScanRun,
  markMediaLibraryPathScanned,
} from "@/modules/media-library/repositories/media-library-repository";

import { type MergedLibraryScan } from "./merge-deduplication";

export type PersistedLibraryScan = {
  discoveredFileCount: number;
  matchedTitleCount: number;
  failedPathCount: number;
  scanRunIds: string[];
};

export async function persistLibraryScanMetadata(
  userId: string,
  merged: MergedLibraryScan,
): Promise<PersistedLibraryScan> {
  const scanRunIds: string[] = [];

  for (const stats of merged.pathStats) {
    const scanRun = await createMediaScanRun({
      userId,
      libraryId: stats.libraryId,
      libraryPathId: stats.libraryPathId,
      status: "running",
    });
    const completed = await completeMediaScanRun({
      scanRunId: scanRun.id,
      status: "succeeded",
      discoveredFileCount: stats.discoveredFileCount,
      matchedTitleCount: stats.matchedTitleCount,
    });

    await markMediaLibraryPathScanned(stats.libraryPathId, completed.completedAt ?? new Date());
    scanRunIds.push(completed.id);
  }

  for (const failedPath of merged.failedPaths) {
    const scanRun = await createMediaScanRun({
      userId,
      libraryId: failedPath.source.library.id,
      libraryPathId: failedPath.source.path.id,
      status: "running",
    });
    const completed = await completeMediaScanRun({
      scanRunId: scanRun.id,
      status: "failed",
      discoveredFileCount: 0,
      matchedTitleCount: 0,
      errorMessage: failedPath.errorMessage,
    });

    scanRunIds.push(completed.id);
  }

  return {
    discoveredFileCount: merged.discoveredFileCount,
    matchedTitleCount: merged.matchedTitleCount,
    failedPathCount: merged.failedPaths.length,
    scanRunIds,
  };
}
