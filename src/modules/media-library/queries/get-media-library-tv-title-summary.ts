import { and, asc, count, eq } from "drizzle-orm";

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

export type MediaLibraryTvSeasonOverview = {
    id: string;
    seasonNumber: number;
    title: string | null;
    monitored: boolean;
    episodeCount: number;
    availableEpisodeCount: number;
};

export type MediaLibraryTvTitleSummary = {
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
    seasons: MediaLibraryTvSeasonOverview[];
    monitoredEpisodes: { season: number; episode: number }[];
};

/**
 * Lightweight TV title view: title metadata + per-season counts only. Episode
 * arrays are not loaded — use `getMediaLibraryTvSeasonEpisodes` to fetch a
 * single season on demand.
 */
export async function getMediaLibraryTvTitleSummary(
    userId: string,
    titleId: string,
): Promise<MediaLibraryTvTitleSummary | null> {
    const database = ensureDatabaseReady();
    const row = database
        .select({ title: mediaTitles, library: mediaLibraries })
        .from(mediaTitles)
        .leftJoin(mediaLibraries, eq(mediaLibraries.id, mediaTitles.libraryId))
        .where(
            and(
                eq(mediaTitles.userId, userId),
                eq(mediaTitles.id, titleId),
                eq(mediaTitles.mediaType, "tv"),
            ),
        )
        .get();

    if (!row) {
        return null;
    }

    const tmdbExternalId = database
        .select({ value: mediaTitleExternalIds.value })
        .from(mediaTitleExternalIds)
        .where(
            and(
                eq(mediaTitleExternalIds.titleId, row.title.id),
                eq(mediaTitleExternalIds.source, "tmdb"),
            ),
        )
        .get();
    const tmdbIdValue = tmdbExternalId ? Number.parseInt(tmdbExternalId.value, 10) : Number.NaN;

    const seasons = database
        .select()
        .from(tvSeasons)
        .where(eq(tvSeasons.titleId, row.title.id))
        .orderBy(asc(tvSeasons.seasonNumber))
        .all();

    const episodeRows = database
        .select({
            id: tvEpisodes.id,
            seasonNumber: tvEpisodes.seasonNumber,
            episodeNumber: tvEpisodes.episodeNumber,
            monitored: tvEpisodes.monitored,
            hasFile: tvEpisodes.hasFile,
        })
        .from(tvEpisodes)
        .where(eq(tvEpisodes.titleId, row.title.id))
        .all();

    const fileStats = database
        .select({
            episodeId: mediaFiles.episodeId,
            fileCount: count(mediaFiles.id),
        })
        .from(mediaFiles)
        .where(
            and(
                eq(mediaFiles.userId, userId),
                eq(mediaFiles.titleId, row.title.id),
                eq(mediaFiles.mediaType, "tv"),
            ),
        )
        .groupBy(mediaFiles.episodeId)
        .all();

    const episodeIdsWithFiles = new Set<string>();
    let totalFiles = 0;

    for (const stats of fileStats) {
        totalFiles += stats.fileCount;

        if (stats.episodeId) {
            episodeIdsWithFiles.add(stats.episodeId);
        }
    }

    const countsBySeason = new Map<
        number,
        { episodeCount: number; availableEpisodeCount: number }
    >();

    for (const episode of episodeRows) {
        const bucket = countsBySeason.get(episode.seasonNumber) ?? {
            episodeCount: 0,
            availableEpisodeCount: 0,
        };

        bucket.episodeCount += 1;

        if (episode.hasFile || episodeIdsWithFiles.has(episode.id)) {
            bucket.availableEpisodeCount += 1;
        }

        countsBySeason.set(episode.seasonNumber, bucket);
    }

    const seasonOverviews = seasons.map<MediaLibraryTvSeasonOverview>((season) => {
        const counts = countsBySeason.get(season.seasonNumber);

        return {
            id: season.id,
            seasonNumber: season.seasonNumber,
            title: season.title,
            monitored: season.monitored,
            episodeCount: counts?.episodeCount ?? season.episodeCount,
            availableEpisodeCount: counts?.availableEpisodeCount ?? 0,
        };
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
            seasons: seasonOverviews.length,
            episodes: episodeRows.length,
            availableEpisodes: seasonOverviews.reduce(
                (acc, season) => acc + season.availableEpisodeCount,
                0,
            ),
            files: totalFiles,
        },
        seasons: seasonOverviews,
        monitoredEpisodes: episodeRows
            .filter((episode) => episode.monitored)
            .map((episode) => ({ season: episode.seasonNumber, episode: episode.episodeNumber })),
    };
}
