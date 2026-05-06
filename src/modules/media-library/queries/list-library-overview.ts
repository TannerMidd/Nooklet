import { eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaLibraries,
  mediaLibraryPaths,
  mediaTitles,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type LibraryPathSummary = {
  id: string;
  label: string;
  path: string;
  status: string;
  lastScannedAt: Date | null;
  fileCount: number;
};

export type LibrarySummary = {
  id: string;
  name: string;
  mediaType: RecommendationMediaType;
  isDefault: boolean;
  pathCount: number;
  titleCount: number;
  fileCount: number;
  paths: LibraryPathSummary[];
};

export type LibraryOverview = {
  libraries: LibrarySummary[];
  totals: {
    libraries: number;
    paths: number;
    titles: number;
    files: number;
  };
};

export async function listLibraryOverview(userId: string): Promise<LibraryOverview> {
  const database = ensureDatabaseReady();
  const libraries = database
    .select()
    .from(mediaLibraries)
    .where(eq(mediaLibraries.userId, userId))
    .all();
  const paths = database
    .select()
    .from(mediaLibraryPaths)
    .where(eq(mediaLibraryPaths.userId, userId))
    .all();
  const titles = database
    .select()
    .from(mediaTitles)
    .where(eq(mediaTitles.userId, userId))
    .all();
  const files = database
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.userId, userId))
    .all();
  const titleCountByLibrary = new Map<string, number>();
  const fileCountByLibraryPath = new Map<string, number>();

  for (const title of titles) {
    if (title.libraryId) {
      titleCountByLibrary.set(title.libraryId, (titleCountByLibrary.get(title.libraryId) ?? 0) + 1);
    }
  }

  for (const file of files) {
    if (file.libraryPathId) {
      fileCountByLibraryPath.set(
        file.libraryPathId,
        (fileCountByLibraryPath.get(file.libraryPathId) ?? 0) + 1,
      );
    }
  }

  const summaries = libraries.map((library) => {
    const libraryPaths = paths.filter((entry) => entry.libraryId === library.id);
    const pathSummaries = libraryPaths.map((entry) => ({
      id: entry.id,
      label: entry.label,
      path: entry.path,
      status: entry.status,
      lastScannedAt: entry.lastScannedAt,
      fileCount: fileCountByLibraryPath.get(entry.id) ?? 0,
    }));

    return {
      id: library.id,
      name: library.name,
      mediaType: library.mediaType,
      isDefault: library.isDefault,
      pathCount: libraryPaths.length,
      titleCount: titleCountByLibrary.get(library.id) ?? 0,
      fileCount: pathSummaries.reduce((total, entry) => total + entry.fileCount, 0),
      paths: pathSummaries,
    } satisfies LibrarySummary;
  });

  return {
    libraries: summaries,
    totals: {
      libraries: summaries.length,
      paths: paths.length,
      titles: titles.length,
      files: files.length,
    },
  };
}
