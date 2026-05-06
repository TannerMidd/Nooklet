import {
  upsertMediaFile,
  upsertMediaTitle,
} from "@/modules/media-library/repositories/media-library-repository";

import { type NormalizedLibraryFile, type NormalizedLibraryScan } from "./normalization";

export type MergedLibraryScan = {
  sources: NormalizedLibraryScan["sources"];
  failedPaths: NormalizedLibraryScan["failedPaths"];
  discoveredFileCount: number;
  matchedTitleCount: number;
  pathStats: Array<{
    libraryId: string;
    libraryPathId: string;
    discoveredFileCount: number;
    matchedTitleCount: number;
  }>;
};

function ensurePathStats(
  stats: Map<string, { libraryId: string; libraryPathId: string; fileCount: number; titleIds: Set<string> }>,
  file: NormalizedLibraryFile,
) {
  const existing = stats.get(file.source.path.id);

  if (existing) {
    return existing;
  }

  const created = {
    libraryId: file.source.library.id,
    libraryPathId: file.source.path.id,
    fileCount: 0,
    titleIds: new Set<string>(),
  };
  stats.set(file.source.path.id, created);

  return created;
}

export async function mergeLibraryScanFiles(userId: string, scan: NormalizedLibraryScan): Promise<MergedLibraryScan> {
  const pathStats = new Map<string, { libraryId: string; libraryPathId: string; fileCount: number; titleIds: Set<string> }>();
  const matchedTitleIds = new Set<string>();

  for (const file of scan.files) {
    const title = await upsertMediaTitle({
      userId,
      libraryId: file.source.library.id,
      mediaType: file.source.library.mediaType,
      title: file.title,
      sortTitle: file.sortTitle,
      year: file.year,
      normalizedKey: file.normalizedKey,
      status: "available",
    });

    if (!title) {
      continue;
    }

    await upsertMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: file.source.path.id,
      mediaType: file.source.library.mediaType,
      fileKind: file.fileKind,
      filePath: file.filePath,
      relativePath: file.relativePath,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      qualityLabel: file.qualityLabel,
    });

    const stats = ensurePathStats(pathStats, file);
    stats.fileCount += 1;
    stats.titleIds.add(title.id);
    matchedTitleIds.add(title.id);
  }

  return {
    sources: scan.sources,
    failedPaths: scan.failedPaths,
    discoveredFileCount: scan.files.length,
    matchedTitleCount: matchedTitleIds.size,
    pathStats: Array.from(pathStats.values()).map((entry) => ({
      libraryId: entry.libraryId,
      libraryPathId: entry.libraryPathId,
      discoveredFileCount: entry.fileCount,
      matchedTitleCount: entry.titleIds.size,
    })),
  };
}
