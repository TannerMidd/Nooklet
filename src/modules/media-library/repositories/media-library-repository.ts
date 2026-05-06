import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaLibraries,
  mediaLibraryPaths,
  mediaTitleExternalIds,
  mediaTitles,
  type MediaTitleExternalIdSource,
  type MediaTitleStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryRecord = typeof mediaLibraries.$inferSelect;
export type MediaLibraryPathRecord = typeof mediaLibraryPaths.$inferSelect;
export type MediaTitleRecord = typeof mediaTitles.$inferSelect;

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
