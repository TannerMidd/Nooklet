import { and, asc, desc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaLibraries,
  mediaLibraryPaths,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryPathOption = {
  id: string;
  libraryId: string;
  libraryName: string;
  mediaType: RecommendationMediaType;
  label: string;
  path: string;
  isDownloadDefault: boolean;
};

export type MediaLibraryDownloadTarget = {
  library: typeof mediaLibraries.$inferSelect;
  path: typeof mediaLibraryPaths.$inferSelect;
};

export async function listMediaLibraryPathOptions(userId: string): Promise<MediaLibraryPathOption[]> {
  const database = ensureDatabaseReady();

  return database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(eq(mediaLibraryPaths.userId, userId), eq(mediaLibraryPaths.status, "active")))
    .orderBy(
      asc(mediaLibraries.mediaType),
      desc(mediaLibraryPaths.isDownloadDefault),
      asc(mediaLibraries.name),
      asc(mediaLibraryPaths.label),
      asc(mediaLibraryPaths.path),
    )
    .all()
    .map(({ library, path }) => ({
      id: path.id,
      libraryId: library.id,
      libraryName: library.name,
      mediaType: library.mediaType,
      label: path.label,
      path: path.path,
      isDownloadDefault: path.isDownloadDefault,
    }));
}

/**
 * Fallback destination when a grab arrives without an explicit folder:
 * prefer a path in the requested library, then the default library for the
 * media type, then any active matching path. Keeps compact request surfaces
 * (recommendations, retries) from queueing downloads that can never import.
 */
export async function resolveDefaultMediaLibraryDownloadTarget(
  userId: string,
  input: {
    mediaType: RecommendationMediaType;
    libraryId?: string | null;
  },
): Promise<MediaLibraryDownloadTarget | null> {
  const database = ensureDatabaseReady();
  const rows = database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(
      eq(mediaLibraryPaths.userId, userId),
      eq(mediaLibraryPaths.status, "active"),
      eq(mediaLibraries.mediaType, input.mediaType),
    ))
    .orderBy(asc(mediaLibraries.name), asc(mediaLibraryPaths.label), asc(mediaLibraryPaths.path))
    .all();

  if (rows.length === 0) {
    return null;
  }

  if (input.libraryId) {
    const libraryRows = rows.filter((row) => row.library.id === input.libraryId);

    if (libraryRows.length > 0) {
      return libraryRows.find((row) => row.path.isDownloadDefault) ?? libraryRows[0] ?? null;
    }
  }

  return rows.find((row) => row.path.isDownloadDefault)
    ?? rows.find((row) => row.library.isDefault)
    ?? rows[0]
    ?? null;
}

export async function resolveMediaLibraryDownloadTarget(
  userId: string,
  input: {
    pathId: string;
    mediaType: RecommendationMediaType;
    libraryId?: string | null;
  },
): Promise<MediaLibraryDownloadTarget | null> {
  const database = ensureDatabaseReady();
  const row = database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(
      eq(mediaLibraryPaths.userId, userId),
      eq(mediaLibraryPaths.id, input.pathId),
      eq(mediaLibraryPaths.status, "active"),
    ))
    .get();

  if (!row || row.library.mediaType !== input.mediaType) {
    return null;
  }

  if (input.libraryId && row.library.id !== input.libraryId) {
    return null;
  }

  return row;
}