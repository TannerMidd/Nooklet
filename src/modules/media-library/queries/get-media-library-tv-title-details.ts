import { and, asc, count, eq, sql } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
  mediaFiles,
  mediaLibraries,
  mediaTitleExternalIds,
  mediaTitles,
  tvEpisodes,
  tvSeasons,
  type MediaQualityProfile,
  type MediaTitleStatus,
} from "@/lib/database/schema";

export type MediaLibraryTvEpisodeSummary = {
  id: string;
  seasonNumber: number;
  episodeNumber: number;
  title: string | null;
  airDate: string | null;
  monitored: boolean;
  hasFile: boolean;
  fileCount: number;
  qualityLabels: string[];
  lastFileModifiedAt: Date | null;
};

export type MediaLibraryTvSeasonSummary = {
  id: string;
  seasonNumber: number;
  title: string | null;
  monitored: boolean;
  episodeCount: number;
  availableEpisodeCount: number;
  episodes: MediaLibraryTvEpisodeSummary[];
};

export type MediaLibraryTvTitleDetails = {
  id: string;
  libraryId: string | null;
  libraryName: string | null;
  title: string;
  year: number | null;
  status: MediaTitleStatus;
  monitored: boolean;
  qualityProfile: MediaQualityProfile;
  overview: string | null;
  posterUrl: string | null;
  tmdbId: number | null;
  totals: {
    seasons: number;
    episodes: number;
    availableEpisodes: number;
    files: number;
  };
  seasons: MediaLibraryTvSeasonSummary[];
};

function parseQualityLabels(value: string | null) {
  return value?.split(",").filter(Boolean).sort() ?? [];
}

export async function getMediaLibraryTvTitleDetails(
  userId: string,
  titleId: string,
): Promise<MediaLibraryTvTitleDetails | null> {
  const database = ensureDatabaseReady();
  const row = database
    .select({ title: mediaTitles, library: mediaLibraries })
    .from(mediaTitles)
    .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
    .where(and(eq(mediaTitles.userId, userId), eq(mediaTitles.id, titleId), eq(mediaTitles.mediaType, "tv")))
    .get();

  if (!row) {
    return null;
  }

  const tmdbExternalId = database
    .select({ value: mediaTitleExternalIds.value })
    .from(mediaTitleExternalIds)
    .where(and(eq(mediaTitleExternalIds.titleId, row.title.id), eq(mediaTitleExternalIds.source, "tmdb")))
    .get();
  const tmdbIdValue = tmdbExternalId ? Number.parseInt(tmdbExternalId.value, 10) : Number.NaN;

  const seasons = database
    .select()
    .from(tvSeasons)
    .where(eq(tvSeasons.titleId, row.title.id))
    .orderBy(asc(tvSeasons.seasonNumber))
    .all();
  const episodes = database
    .select()
    .from(tvEpisodes)
    .where(eq(tvEpisodes.titleId, row.title.id))
    .orderBy(asc(tvEpisodes.seasonNumber), asc(tvEpisodes.episodeNumber))
    .all();
  const fileStats = database
    .select({
      episodeId: mediaFiles.episodeId,
      fileCount: count(mediaFiles.id),
      qualityLabels: sql<string | null>`group_concat(distinct ${mediaFiles.qualityLabel})`,
      lastModifiedAtMs: sql<number | null>`max(${mediaFiles.modifiedAt})`,
    })
    .from(mediaFiles)
    .where(and(eq(mediaFiles.userId, userId), eq(mediaFiles.titleId, row.title.id), eq(mediaFiles.mediaType, "tv")))
    .groupBy(mediaFiles.episodeId)
    .all();
  const fileStatsByEpisode = new Map<string, { fileCount: number; qualityLabels: string[]; lastFileModifiedAt: Date | null }>();
  let totalFiles = 0;

  for (const stats of fileStats) {
    totalFiles += stats.fileCount;

    if (!stats.episodeId) {
      continue;
    }

    fileStatsByEpisode.set(stats.episodeId, {
      fileCount: stats.fileCount,
      qualityLabels: parseQualityLabels(stats.qualityLabels),
      lastFileModifiedAt: typeof stats.lastModifiedAtMs === "number" ? new Date(stats.lastModifiedAtMs) : null,
    });
  }

  const episodesBySeason = new Map<number, MediaLibraryTvEpisodeSummary[]>();

  for (const episode of episodes) {
    const stats = fileStatsByEpisode.get(episode.id);
    const summary = {
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
    } satisfies MediaLibraryTvEpisodeSummary;

    episodesBySeason.set(
      episode.seasonNumber,
      [...(episodesBySeason.get(episode.seasonNumber) ?? []), summary],
    );
  }

  const seasonSummaries = seasons.map((season) => {
    const seasonEpisodes = episodesBySeason.get(season.seasonNumber) ?? [];

    return {
      id: season.id,
      seasonNumber: season.seasonNumber,
      title: season.title,
      monitored: season.monitored,
      episodeCount: seasonEpisodes.length || season.episodeCount,
      availableEpisodeCount: seasonEpisodes.filter((episode) => episode.hasFile || episode.fileCount > 0).length,
      episodes: seasonEpisodes,
    } satisfies MediaLibraryTvSeasonSummary;
  });

  return {
    id: row.title.id,
    libraryId: row.title.libraryId,
    libraryName: row.library?.name ?? null,
    title: row.title.title,
    year: row.title.year,
    status: row.title.status,
    monitored: row.title.monitored,
    qualityProfile: row.title.qualityProfile,
    overview: row.title.overview,
    posterUrl: row.title.posterUrl,
    tmdbId: Number.isFinite(tmdbIdValue) ? tmdbIdValue : null,
    totals: {
      seasons: seasonSummaries.length,
      episodes: episodes.length,
      availableEpisodes: episodes.filter((episode) => episode.hasFile || fileStatsByEpisode.has(episode.id)).length,
      files: totalFiles,
    },
    seasons: seasonSummaries,
  };
}