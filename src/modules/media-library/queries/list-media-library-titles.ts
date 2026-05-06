import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaLibraries,
  mediaTitles,
  type MediaTitleStatus,
  type RecommendationMediaType,
} from "@/lib/database/schema";

export type MediaLibraryTitleSummary = {
  id: string;
  libraryId: string | null;
  libraryName: string | null;
  mediaType: RecommendationMediaType;
  title: string;
  year: number | null;
  status: MediaTitleStatus;
  monitored: boolean;
  overview: string | null;
  posterUrl: string | null;
  fileCount: number;
  qualityLabels: string[];
  lastFileModifiedAt: Date | null;
};

export type MediaLibraryTitleList = {
  mediaType: RecommendationMediaType;
  titles: MediaLibraryTitleSummary[];
  totals: {
    titles: number;
    files: number;
    monitored: number;
    missing: number;
  };
};

export async function listMediaLibraryTitles(
  userId: string,
  mediaType: RecommendationMediaType,
  query?: string | null,
): Promise<MediaLibraryTitleList> {
  const database = ensureDatabaseReady();
  const normalizedQuery = query?.trim().toLowerCase() ?? "";
  const titles = database
    .select({ title: mediaTitles, library: mediaLibraries })
    .from(mediaTitles)
    .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
    .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.mediaType, mediaType)))
    .all();
  const files = database
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.mediaType, mediaType)))
    .all();
  const fileStatsByTitle = new Map<string, { count: number; qualities: Set<string>; lastModifiedAt: Date | null }>();

  for (const file of files) {
    const stats = fileStatsByTitle.get(file.titleId) ?? { count: 0, qualities: new Set<string>(), lastModifiedAt: null };
    stats.count += 1;

    if (file.qualityLabel) {
      stats.qualities.add(file.qualityLabel);
    }

    if (file.modifiedAt && (!stats.lastModifiedAt || file.modifiedAt > stats.lastModifiedAt)) {
      stats.lastModifiedAt = file.modifiedAt;
    }

    fileStatsByTitle.set(file.titleId, stats);
  }

  const summaries = titles
    .filter(({ title }) => {
      if (!normalizedQuery) {
        return true;
      }

      return title.title.toLowerCase().includes(normalizedQuery);
    })
    .map(({ title, library }) => {
      const stats = fileStatsByTitle.get(title.id);

      return {
        id: title.id,
        libraryId: title.libraryId,
        libraryName: library?.name ?? null,
        mediaType: title.mediaType,
        title: title.title,
        year: title.year,
        status: title.status,
        monitored: title.monitored,
        overview: title.overview,
        posterUrl: title.posterUrl,
        fileCount: stats?.count ?? 0,
        qualityLabels: stats ? Array.from(stats.qualities).sort() : [],
        lastFileModifiedAt: stats?.lastModifiedAt ?? null,
      } satisfies MediaLibraryTitleSummary;
    })
    .sort((left, right) => left.title.localeCompare(right.title));

  return {
    mediaType,
    titles: summaries,
    totals: {
      titles: summaries.length,
      files: summaries.reduce((total, title) => total + title.fileCount, 0),
      monitored: summaries.filter((title) => title.monitored).length,
      missing: summaries.filter((title) => title.status === "missing").length,
    },
  };
}
