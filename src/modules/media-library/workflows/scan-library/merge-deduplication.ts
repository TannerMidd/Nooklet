import {
  countMediaFilesForTitle,
  countMediaTitleExternalIds,
  deleteMediaFilesByLibraryPath,
  deleteMediaTitleByIdForUser,
  findMediaFileByUserPath,
  findMediaTitleByIdForUser,
  listMediaFileTitleIdsByLibraryPath,
  type MediaTitleRecord,
  upsertMediaFile,
  upsertMediaTitle,
  upsertTvEpisode,
  upsertTvSeason,
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

function titleHasScannerOnlyMetadata(title: MediaTitleRecord) {
  return title.status === "available"
    && title.overview === null
    && title.posterUrl === null
    && title.backdropUrl === null
    && title.runtimeMinutes === null
    && title.originalLanguage === null;
}

async function deleteOrphanedScannerTitle(userId: string, titleId: string) {
  const title = await findMediaTitleByIdForUser(userId, titleId);

  if (!title || !titleHasScannerOnlyMetadata(title)) {
    return;
  }

  const fileCount = await countMediaFilesForTitle(titleId);
  const externalIdCount = await countMediaTitleExternalIds(titleId);

  if (fileCount === 0 && externalIdCount === 0) {
    await deleteMediaTitleByIdForUser(userId, titleId);
  }
}

async function clearSuccessfullyScannedPathFiles(userId: string, scan: NormalizedLibraryScan) {
  const failedPathIds = new Set(scan.failedPaths.map((failedPath) => failedPath.source.path.id));
  const clearedPathIds = new Set<string>();
  const staleTitleIds = new Set<string>();

  for (const source of scan.sources) {
    if (failedPathIds.has(source.path.id) || clearedPathIds.has(source.path.id)) {
      continue;
    }

    for (const titleId of await listMediaFileTitleIdsByLibraryPath(userId, source.path.id)) {
      staleTitleIds.add(titleId);
    }

    await deleteMediaFilesByLibraryPath(userId, source.path.id);
    clearedPathIds.add(source.path.id);
  }

  return staleTitleIds;
}

export async function mergeLibraryScanFiles(userId: string, scan: NormalizedLibraryScan): Promise<MergedLibraryScan> {
  const pathStats = new Map<string, { libraryId: string; libraryPathId: string; fileCount: number; titleIds: Set<string> }>();
  const matchedTitleIds = new Set<string>();
  const staleTitleIds = await clearSuccessfullyScannedPathFiles(userId, scan);

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

    const existingFile = await findMediaFileByUserPath(userId, file.filePath);

    const season = file.source.library.mediaType === "tv" && file.seasonNumber !== null
      ? await upsertTvSeason({
          titleId: title.id,
          seasonNumber: file.seasonNumber,
          title: `Season ${file.seasonNumber}`,
        })
      : null;
    const episode = season && file.episodeNumber !== null
      ? await upsertTvEpisode({
          titleId: title.id,
          seasonId: season.id,
          seasonNumber: file.seasonNumber!,
          episodeNumber: file.episodeNumber,
          hasFile: true,
        })
      : null;

    await upsertMediaFile({
      userId,
      titleId: title.id,
      libraryPathId: file.source.path.id,
      seasonId: season?.id ?? null,
      episodeId: episode?.id ?? null,
      mediaType: file.source.library.mediaType,
      fileKind: file.fileKind,
      filePath: file.filePath,
      relativePath: file.relativePath,
      sizeBytes: file.sizeBytes,
      modifiedAt: file.modifiedAt,
      qualityLabel: file.qualityLabel,
    });

    if (existingFile?.titleId && existingFile.titleId !== title.id) {
      await deleteOrphanedScannerTitle(userId, existingFile.titleId);
    }

    const stats = ensurePathStats(pathStats, file);
    stats.fileCount += 1;
    stats.titleIds.add(title.id);
    matchedTitleIds.add(title.id);
  }

  for (const titleId of staleTitleIds) {
    await deleteOrphanedScannerTitle(userId, titleId);
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
