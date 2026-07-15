import { and, asc, desc, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
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
  const loadRows = (ownerUserId: string) => database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(eq(mediaLibraryPaths.userId, ownerUserId), eq(mediaLibraryPaths.status, "active")))
    .orderBy(
      asc(mediaLibraries.mediaType),
      desc(mediaLibraryPaths.isDownloadDefault),
      asc(mediaLibraries.name),
      asc(mediaLibraryPaths.label),
      asc(mediaLibraryPaths.path),
    )
    .all();
  const ownedRows = loadRows(userId);
  const ownedTypes = new Set(ownedRows.map(({ library }) => library.mediaType));
  const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);
  const rows = instanceOwnerId === userId || ownedTypes.size === 2
    ? ownedRows
    : [
        ...ownedRows,
        ...loadRows(instanceOwnerId).filter(({ library }) => !ownedTypes.has(library.mediaType)),
      ];

  return rows
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
  const loadRows = (ownerUserId: string) => database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(
      eq(mediaLibraryPaths.userId, ownerUserId),
      eq(mediaLibraryPaths.status, "active"),
      eq(mediaLibraries.mediaType, input.mediaType),
    ))
    .orderBy(asc(mediaLibraries.name), asc(mediaLibraryPaths.label), asc(mediaLibraryPaths.path))
    .all();

  let rows = loadRows(userId);
  if (rows.length === 0) {
    const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);
    if (instanceOwnerId !== userId) {
      rows = loadRows(instanceOwnerId);
    }
  }

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
  const loadRow = (ownerUserId: string) => database
    .select({ library: mediaLibraries, path: mediaLibraryPaths })
    .from(mediaLibraryPaths)
    .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
    .where(and(
      eq(mediaLibraryPaths.userId, ownerUserId),
      eq(mediaLibraryPaths.id, input.pathId),
      eq(mediaLibraryPaths.status, "active"),
    ))
    .get();

  let row = loadRow(userId);
  if (!row) {
    const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);
    if (instanceOwnerId !== userId) {
      row = loadRow(instanceOwnerId);
    }
  }

  if (!row || row.library.mediaType !== input.mediaType) {
    return null;
  }

  if (input.libraryId && row.library.id !== input.libraryId) {
    return null;
  }

  return row;
}
