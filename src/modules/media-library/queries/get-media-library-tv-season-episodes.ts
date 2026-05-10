import { and, asc, count, eq, inArray, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { mediaFiles, mediaTitles, tvEpisodes } from "@/lib/database/schema";

import type { MediaLibraryTvEpisodeSummary } from "./get-media-library-tv-title-details";

function parseQualityLabels(value: string | null) {
  return value?.split(",").filter(Boolean).sort() ?? [];
}

/**
 * Loads the episode list for a single season of a TV title. Returns an empty
 * array when the title does not exist for the user or no episodes are
 * recorded for the season.
 */
export async function getMediaLibraryTvSeasonEpisodes(
  userId: string,
  titleId: string,
  seasonNumber: number,
): Promise<MediaLibraryTvEpisodeSummary[]> {
  const database = ensureDatabaseReady();
  const titleRow = database
    .select({ id: mediaTitles.id })
    .from(mediaTitles)
    .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.id, titleId), eq(mediaTitles.mediaType, "tv")))
    .get();

  if (!titleRow) {
    return [];
  }

  const episodes = database
    .select()
    .from(tvEpisodes)
    .where(and(eq(tvEpisodes.titleId, titleRow.id), eq(tvEpisodes.seasonNumber, seasonNumber)))
    .orderBy(asc(tvEpisodes.episodeNumber))
    .all();

  if (episodes.length === 0) {
    return [];
  }

  const episodeIds = episodes.map((episode) => episode.id);

  const fileStats = database
    .select({
      episodeId: mediaFiles.episodeId,
      fileCount: count(mediaFiles.id),
      qualityLabels: sql<string | null>`group_concat(distinct ${mediaFiles.qualityLabel})`,
      lastModifiedAtMs: sql<number | null>`max(${mediaFiles.modifiedAt})`,
    })
    .from(mediaFiles)
    .where(
      and(
        eq(mediaFiles.userId, userId),
        eq(mediaFiles.titleId, titleRow.id),
        eq(mediaFiles.mediaType, "tv"),
        inArray(mediaFiles.episodeId, episodeIds),
      ),
    )
    .groupBy(mediaFiles.episodeId)
    .all();

  const fileStatsByEpisode = new Map<string, { fileCount: number; qualityLabels: string[]; lastFileModifiedAt: Date | null }>();

  for (const stats of fileStats) {
    if (!stats.episodeId) {
      continue;
    }

    fileStatsByEpisode.set(stats.episodeId, {
      fileCount: stats.fileCount,
      qualityLabels: parseQualityLabels(stats.qualityLabels),
      lastFileModifiedAt: typeof stats.lastModifiedAtMs === "number" ? new Date(stats.lastModifiedAtMs) : null,
    });
  }

  return episodes.map<MediaLibraryTvEpisodeSummary>((episode) => {
    const stats = fileStatsByEpisode.get(episode.id);

    return {
      id: episode.id,
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      airDate: episode.airDate,
      monitored: episode.monitored,
      hasFile: episode.hasFile,
      fileCount: stats?.fileCount ?? 0,
      qualityLabels: stats?.qualityLabels ?? [],
      lastFileModifiedAt: stats?.lastFileModifiedAt ?? null,
    };
  });
}
