import { randomUUID } from "node:crypto";

import { and, count, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaLibraries,
  mediaLibraryPaths,
  mediaScanRuns,
  mediaTitleExternalIds,
  mediaTitles,
  tvEpisodes,
  tvSeasons,
  type MediaFileKind,
  type MediaLibraryPathStatus,
  type MediaScanRunStatus,
  type MediaQualityProfile,
  type MediaTitleExternalIdSource,
  type MediaTitleStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryRecord = typeof mediaLibraries.$inferSelect;
export type MediaLibraryPathRecord = typeof mediaLibraryPaths.$inferSelect;
export type MediaTitleRecord = typeof mediaTitles.$inferSelect;
export type MediaFileRecord = typeof mediaFiles.$inferSelect;
export type MediaScanRunRecord = typeof mediaScanRuns.$inferSelect;
export type TvEpisodeRecord = typeof tvEpisodes.$inferSelect;
export type TvEpisodeWithTitleRecord = {
  episode: TvEpisodeRecord;
  title: MediaTitleRecord;
};
export type ActiveMediaLibraryPathRecord = {
  library: MediaLibraryRecord;
  path: MediaLibraryPathRecord;
};

export async function createMediaLibrary(input: {
  userId: string;
  mediaType: RecommendationMediaType;
  name: string;
  isDefault?: boolean;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(mediaLibraries)
    .values({
      id,
      userId: input.userId,
      mediaType: input.mediaType,
      name: input.name,
      isDefault: input.isDefault ?? false,
    })
    .run();

  return database.select().from(mediaLibraries).where(eq(mediaLibraries.id, id)).get()!;
}

export async function findMediaLibraryByName(
  userId: string,
  mediaType: RecommendationMediaType,
  name: string,
) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaLibraries)
    .where(
      and(
        eq(mediaLibraries.userId, userId),
        eq(mediaLibraries.mediaType, mediaType),
        eq(mediaLibraries.name, name),
      ),
    )
    .get() ?? null;
}

export async function findMediaLibraryByIdForUser(userId: string, libraryId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaLibraries)
    .where(and(eq(mediaLibraries.userId, userId), eq(mediaLibraries.id, libraryId)))
    .get() ?? null;
}

export async function addMediaLibraryPath(input: {
  libraryId: string;
  userId: string;
  path: string;
  label: string;
  freeSpaceBytes?: number | null;
  totalSpaceBytes?: number | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(mediaLibraryPaths)
    .values({
      id,
      libraryId: input.libraryId,
      userId: input.userId,
      path: input.path,
      label: input.label,
      freeSpaceBytes: input.freeSpaceBytes ?? null,
      totalSpaceBytes: input.totalSpaceBytes ?? null,
    })
    .run();

  return database.select().from(mediaLibraryPaths).where(eq(mediaLibraryPaths.id, id)).get()!;
}

export async function findMediaLibraryPathByUserPath(userId: string, path: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaLibraryPaths)
    .where(and(eq(mediaLibraryPaths.userId, userId), eq(mediaLibraryPaths.path, path)))
    .get() ?? null;
}

export async function findMediaLibraryPathByIdForUser(userId: string, pathId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaLibraryPaths)
    .where(and(eq(mediaLibraryPaths.userId, userId), eq(mediaLibraryPaths.id, pathId)))
    .get() ?? null;
}

export async function updateMediaLibraryPath(input: {
  id: string;
  userId: string;
  libraryId: string;
  path: string;
  label: string;
  status: MediaLibraryPathStatus;
}) {
  const database = ensureDatabaseReady();
  const updatedAt = new Date();

  database
    .update(mediaLibraryPaths)
    .set({
      libraryId: input.libraryId,
      path: input.path,
      label: input.label,
      status: input.status,
      updatedAt,
    })
    .where(and(eq(mediaLibraryPaths.id, input.id), eq(mediaLibraryPaths.userId, input.userId)))
    .run();

  return findMediaLibraryPathByIdForUser(input.userId, input.id);
}

export async function deleteMediaLibraryPath(userId: string, pathId: string) {
  const database = ensureDatabaseReady();
  const existingPath = await findMediaLibraryPathByIdForUser(userId, pathId);

  if (!existingPath) {
    return null;
  }

  database
    .delete(mediaLibraryPaths)
    .where(and(eq(mediaLibraryPaths.id, pathId), eq(mediaLibraryPaths.userId, userId)))
    .run();

  return existingPath;
}

export async function listActiveMediaLibraryPaths(userId: string): Promise<ActiveMediaLibraryPathRecord[]> {
  const database = ensureDatabaseReady();

  return database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(eq(mediaLibraryPaths.userId, userId), eq(mediaLibraryPaths.status, "active")))
    .all();
}

export async function markMediaLibraryPathScanned(pathId: string, scannedAt: Date = new Date()) {
  const database = ensureDatabaseReady();

  database
    .update(mediaLibraryPaths)
    .set({ lastScannedAt: scannedAt, updatedAt: scannedAt })
    .where(eq(mediaLibraryPaths.id, pathId))
    .run();
}

export async function upsertMediaTitle(input: {
  userId: string;
  libraryId?: string | null;
  mediaType: RecommendationMediaType;
  title: string;
  sortTitle: string;
  year?: number | null;
  normalizedKey: string;
  status?: MediaTitleStatus;
  monitored?: boolean;
  qualityProfile?: MediaQualityProfile;
  overview?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
  runtimeMinutes?: number | null;
  originalLanguage?: string | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();
  const values = {
    id,
    userId: input.userId,
    libraryId: input.libraryId ?? null,
    mediaType: input.mediaType,
    title: input.title,
    sortTitle: input.sortTitle,
    year: input.year ?? null,
    normalizedKey: input.normalizedKey,
    status: input.status ?? "missing",
    monitored: input.monitored ?? true,
    qualityProfile: input.qualityProfile ?? "hd-1080p",
    overview: input.overview ?? null,
    posterUrl: input.posterUrl ?? null,
    backdropUrl: input.backdropUrl ?? null,
    runtimeMinutes: input.runtimeMinutes ?? null,
    originalLanguage: input.originalLanguage ?? null,
    updatedAt: new Date(),
  };

  database
    .insert(mediaTitles)
    .values(values)
    .onConflictDoUpdate({
      target: [mediaTitles.userId, mediaTitles.mediaType, mediaTitles.normalizedKey],
      set: {
        libraryId: values.libraryId,
        title: values.title,
        sortTitle: values.sortTitle,
        year: values.year,
        status: values.status,
        monitored: values.monitored,
        qualityProfile: values.qualityProfile,
        overview: values.overview,
        posterUrl: values.posterUrl,
        backdropUrl: values.backdropUrl,
        runtimeMinutes: values.runtimeMinutes,
        originalLanguage: values.originalLanguage,
        updatedAt: values.updatedAt,
      },
    })
    .run();

  return findMediaTitleByNormalizedKey(input.userId, input.mediaType, input.normalizedKey);
}

export async function findMediaTitleByNormalizedKey(
  userId: string,
  mediaType: RecommendationMediaType,
  normalizedKey: string,
) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaTitles)
    .where(
      and(
        eq(mediaTitles.userId, userId),
        eq(mediaTitles.mediaType, mediaType),
        eq(mediaTitles.normalizedKey, normalizedKey),
      ),
    )
    .get() ?? null;
}

export async function findMediaTitleByIdForUser(userId: string, titleId: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaTitles)
    .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.id, titleId)))
    .get() ?? null;
}

export async function deleteMediaTitleByIdForUser(userId: string, titleId: string) {
  const database = ensureDatabaseReady();
  const existingTitle = await findMediaTitleByIdForUser(userId, titleId);

  if (!existingTitle) {
    return null;
  }

  database
    .delete(mediaTitles)
    .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.id, titleId)))
    .run();

  return existingTitle;
}

export async function countMediaFilesForTitle(titleId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ count: count(mediaFiles.id) })
    .from(mediaFiles)
    .where(eq(mediaFiles.titleId, titleId))
    .get()?.count ?? 0;
}

export async function countMediaTitleExternalIds(titleId: string) {
  const database = ensureDatabaseReady();

  return database
    .select({ count: count(mediaTitleExternalIds.titleId) })
    .from(mediaTitleExternalIds)
    .where(eq(mediaTitleExternalIds.titleId, titleId))
    .get()?.count ?? 0;
}

export async function listMediaFileTitleIdsByLibraryPath(userId: string, libraryPathId: string) {
  const database = ensureDatabaseReady();
  const rows = database
    .select({ titleId: mediaFiles.titleId })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.libraryPathId, libraryPathId)))
    .all();

  return Array.from(new Set(rows.map((row) => row.titleId)));
}

export async function deleteMediaFilesByLibraryPath(userId: string, libraryPathId: string) {
  const database = ensureDatabaseReady();

  database
    .delete(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.libraryPathId, libraryPathId)))
    .run();
}

export async function updateMediaTitlePreferences(input: {
  userId: string;
  titleId: string;
  monitored: boolean;
  qualityProfile: MediaQualityProfile;
}) {
  const database = ensureDatabaseReady();
  const updatedAt = new Date();

  database
    .update(mediaTitles)
    .set({
      monitored: input.monitored,
      qualityProfile: input.qualityProfile,
      updatedAt,
    })
    .where(and(eq(mediaTitles.userId, input.userId), eq(mediaTitles.id, input.titleId)))
    .run();

  return findMediaTitleByIdForUser(input.userId, input.titleId);
}

export async function setMediaTitleExternalIds(
  titleId: string,
  externalIds: Array<{ source: MediaTitleExternalIdSource; value: string }>,
) {
  const database = ensureDatabaseReady();
  const uniqueExternalIds = Array.from(
    new Map(externalIds.map((entry) => [entry.source, entry])).values(),
  );

  database
    .delete(mediaTitleExternalIds)
    .where(eq(mediaTitleExternalIds.titleId, titleId))
    .run();

  if (uniqueExternalIds.length === 0) {
    return [];
  }

  database
    .insert(mediaTitleExternalIds)
    .values(
      uniqueExternalIds.map((entry) => ({
        titleId,
        source: entry.source,
        value: entry.value,
      })),
    )
    .run();

  return database
    .select()
    .from(mediaTitleExternalIds)
    .where(eq(mediaTitleExternalIds.titleId, titleId))
    .all();
}

export async function createTvSeason(input: {
  titleId: string;
  seasonNumber: number;
  title?: string | null;
  episodeCount?: number;
  monitored?: boolean;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(tvSeasons)
    .values({
      id,
      titleId: input.titleId,
      seasonNumber: input.seasonNumber,
      title: input.title ?? null,
      episodeCount: input.episodeCount ?? 0,
      monitored: input.monitored ?? true,
    })
    .run();

  return database.select().from(tvSeasons).where(eq(tvSeasons.id, id)).get()!;
}

export async function upsertTvSeason(input: {
  titleId: string;
  seasonNumber: number;
  title?: string | null;
  episodeCount?: number;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();
  const values = {
    id,
    titleId: input.titleId,
    seasonNumber: input.seasonNumber,
    title: input.title ?? null,
    episodeCount: input.episodeCount ?? 0,
    updatedAt: new Date(),
  };

  database
    .insert(tvSeasons)
    .values(values)
    .onConflictDoUpdate({
      target: [tvSeasons.titleId, tvSeasons.seasonNumber],
      set: {
        title: values.title,
        episodeCount: values.episodeCount,
        updatedAt: values.updatedAt,
      },
    })
    .run();

  return database
    .select()
    .from(tvSeasons)
    .where(and(eq(tvSeasons.titleId, input.titleId), eq(tvSeasons.seasonNumber, input.seasonNumber)))
    .get()!;
}

export async function createTvEpisode(input: {
  titleId: string;
  seasonId: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: string | null;
  airDate?: string | null;
  monitored?: boolean;
  hasFile?: boolean;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(tvEpisodes)
    .values({
      id,
      titleId: input.titleId,
      seasonId: input.seasonId,
      seasonNumber: input.seasonNumber,
      episodeNumber: input.episodeNumber,
      title: input.title ?? null,
      airDate: input.airDate ?? null,
      monitored: input.monitored ?? true,
      hasFile: input.hasFile ?? false,
    })
    .run();

  return database.select().from(tvEpisodes).where(eq(tvEpisodes.id, id)).get()!;
}

export async function upsertTvEpisode(input: {
  titleId: string;
  seasonId: string;
  seasonNumber: number;
  episodeNumber: number;
  title?: string | null;
  airDate?: string | null;
  hasFile?: boolean;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();
  const values = {
    id,
    titleId: input.titleId,
    seasonId: input.seasonId,
    seasonNumber: input.seasonNumber,
    episodeNumber: input.episodeNumber,
    title: input.title ?? null,
    airDate: input.airDate ?? null,
    hasFile: input.hasFile ?? false,
    updatedAt: new Date(),
  };

  database
    .insert(tvEpisodes)
    .values(values)
    .onConflictDoUpdate({
      target: [tvEpisodes.titleId, tvEpisodes.seasonNumber, tvEpisodes.episodeNumber],
      set: {
        seasonId: values.seasonId,
        title: values.title,
        airDate: values.airDate,
        hasFile: values.hasFile,
        updatedAt: values.updatedAt,
      },
    })
    .run();

  return database
    .select()
    .from(tvEpisodes)
    .where(and(
      eq(tvEpisodes.titleId, input.titleId),
      eq(tvEpisodes.seasonNumber, input.seasonNumber),
      eq(tvEpisodes.episodeNumber, input.episodeNumber),
    ))
    .get()!;
}

export async function findTvEpisodeByIdForUser(
  userId: string,
  episodeId: string,
): Promise<TvEpisodeWithTitleRecord | null> {
  const database = ensureDatabaseReady();

  return database
    .select({ episode: tvEpisodes, title: mediaTitles })
    .from(tvEpisodes)
    .innerJoin(mediaTitles, eq(mediaTitles.id, tvEpisodes.titleId))
    .where(and(eq(mediaTitles.userId, userId), eq(tvEpisodes.id, episodeId)))
    .get() ?? null;
}

export async function updateTvEpisodeMonitoring(input: {
  userId: string;
  episodeId: string;
  monitored: boolean;
}): Promise<TvEpisodeWithTitleRecord | null> {
  const existing = await findTvEpisodeByIdForUser(input.userId, input.episodeId);

  if (!existing) {
    return null;
  }

  const database = ensureDatabaseReady();

  database
    .update(tvEpisodes)
    .set({ monitored: input.monitored, updatedAt: new Date() })
    .where(eq(tvEpisodes.id, input.episodeId))
    .run();

  return findTvEpisodeByIdForUser(input.userId, input.episodeId);
}

export async function recordMediaFile(input: {
  userId: string;
  titleId: string;
  libraryPathId?: string | null;
  seasonId?: string | null;
  episodeId?: string | null;
  mediaType: RecommendationMediaType;
  fileKind: MediaFileKind;
  filePath: string;
  relativePath: string;
  sizeBytes?: number | null;
  modifiedAt?: Date | null;
  qualityLabel?: string | null;
  releaseGroup?: string | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(mediaFiles)
    .values({
      id,
      userId: input.userId,
      titleId: input.titleId,
      libraryPathId: input.libraryPathId ?? null,
      seasonId: input.seasonId ?? null,
      episodeId: input.episodeId ?? null,
      mediaType: input.mediaType,
      fileKind: input.fileKind,
      filePath: input.filePath,
      relativePath: input.relativePath,
      sizeBytes: input.sizeBytes ?? null,
      modifiedAt: input.modifiedAt ?? null,
      qualityLabel: input.qualityLabel ?? null,
      releaseGroup: input.releaseGroup ?? null,
    })
    .run();

  return database.select().from(mediaFiles).where(eq(mediaFiles.id, id)).get()!;
}

export async function upsertMediaFile(input: {
  userId: string;
  titleId: string;
  libraryPathId?: string | null;
  seasonId?: string | null;
  episodeId?: string | null;
  mediaType: RecommendationMediaType;
  fileKind: MediaFileKind;
  filePath: string;
  relativePath: string;
  sizeBytes?: number | null;
  modifiedAt?: Date | null;
  qualityLabel?: string | null;
  releaseGroup?: string | null;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();
  const values = {
    id,
    userId: input.userId,
    titleId: input.titleId,
    libraryPathId: input.libraryPathId ?? null,
    seasonId: input.seasonId ?? null,
    episodeId: input.episodeId ?? null,
    mediaType: input.mediaType,
    fileKind: input.fileKind,
    filePath: input.filePath,
    relativePath: input.relativePath,
    sizeBytes: input.sizeBytes ?? null,
    modifiedAt: input.modifiedAt ?? null,
    qualityLabel: input.qualityLabel ?? null,
    releaseGroup: input.releaseGroup ?? null,
    updatedAt: new Date(),
  };

  database
    .insert(mediaFiles)
    .values(values)
    .onConflictDoUpdate({
      target: [mediaFiles.userId, mediaFiles.filePath],
      set: {
        titleId: values.titleId,
        libraryPathId: values.libraryPathId,
        seasonId: values.seasonId,
        episodeId: values.episodeId,
        mediaType: values.mediaType,
        fileKind: values.fileKind,
        relativePath: values.relativePath,
        sizeBytes: values.sizeBytes,
        modifiedAt: values.modifiedAt,
        qualityLabel: values.qualityLabel,
        releaseGroup: values.releaseGroup,
        updatedAt: values.updatedAt,
      },
    })
    .run();

  return database
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, input.userId), eq(mediaFiles.filePath, input.filePath)))
    .get()!;
}

export async function findMediaFileByUserPath(userId: string, filePath: string) {
  const database = ensureDatabaseReady();

  return database
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.filePath, filePath)))
    .get() ?? null;
}

export async function createMediaScanRun(input: {
  userId: string;
  libraryId?: string | null;
  libraryPathId?: string | null;
  status?: MediaScanRunStatus;
}) {
  const database = ensureDatabaseReady();
  const id = randomUUID();

  database
    .insert(mediaScanRuns)
    .values({
      id,
      userId: input.userId,
      libraryId: input.libraryId ?? null,
      libraryPathId: input.libraryPathId ?? null,
      status: input.status ?? "pending",
    })
    .run();

  return database.select().from(mediaScanRuns).where(eq(mediaScanRuns.id, id)).get()!;
}

export async function completeMediaScanRun(input: {
  scanRunId: string;
  status: Extract<MediaScanRunStatus, "succeeded" | "failed">;
  discoveredFileCount: number;
  matchedTitleCount: number;
  errorMessage?: string | null;
  completedAt?: Date;
}) {
  const database = ensureDatabaseReady();
  const completedAt = input.completedAt ?? new Date();

  database
    .update(mediaScanRuns)
    .set({
      status: input.status,
      discoveredFileCount: input.discoveredFileCount,
      matchedTitleCount: input.matchedTitleCount,
      errorMessage: input.errorMessage ?? null,
      completedAt,
    })
    .where(eq(mediaScanRuns.id, input.scanRunId))
    .run();

  return database.select().from(mediaScanRuns).where(eq(mediaScanRuns.id, input.scanRunId)).get()!;
}
