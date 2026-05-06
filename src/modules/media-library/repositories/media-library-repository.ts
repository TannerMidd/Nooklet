import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

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
  type MediaScanRunStatus,
  type MediaTitleExternalIdSource,
  type MediaTitleStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryRecord = typeof mediaLibraries.$inferSelect;
export type MediaLibraryPathRecord = typeof mediaLibraryPaths.$inferSelect;
export type MediaTitleRecord = typeof mediaTitles.$inferSelect;
export type MediaFileRecord = typeof mediaFiles.$inferSelect;
export type MediaScanRunRecord = typeof mediaScanRuns.$inferSelect;

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
