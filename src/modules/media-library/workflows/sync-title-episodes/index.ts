import {
    listTvEpisodesForTitle,
    listTvSeasonsForTitle,
    upsertTvEpisode,
    upsertTvSeason,
} from "@/modules/media-library/repositories/media-library-repository";
import {
    getTmdbTvSeasonEpisodesForUser,
    getTmdbTvSeasonsForUser,
} from "@/modules/service-connections/queries/get-tmdb-tv-seasons";

import {
    episodeMonitoring,
    seasonMonitoring,
    type EpisodeSyncMonitoringPolicy,
} from "./monitoring-policy";

export type { EpisodeSyncMonitoringPolicy };

export type SyncTitleEpisodesScope = "all" | { seasons: number[] };

export type SyncTitleEpisodesInput = {
    titleId: string;
    tmdbId: number;
    scope: SyncTitleEpisodesScope;
    policy: EpisodeSyncMonitoringPolicy;
};

export type SyncTitleEpisodesResult =
    | {
          ok: true;
          seasonIdByNumber: Map<number, string>;
          episodeIdByNumber: Map<string, string>;
          newEpisodeCount: number;
      }
    | { ok: false; reason: "tmdb-not-configured" | "tmdb-error"; message: string };

function episodeKey(seasonNumber: number, episodeNumber: number) {
    return `${seasonNumber}:${episodeNumber}`;
}

/**
 * Persists a TV title's season/episode structure from TMDB. Season rows are
 * always written for every known season (cheap, one TMDB call); episode rows
 * are written for the scoped seasons only. Monitored flags follow the policy:
 * existing rows keep their value unless the policy explicitly re-monitors
 * them, so a refresh never undoes a user's monitoring choices.
 */
export async function syncTitleEpisodesWorkflow(
    userId: string,
    input: SyncTitleEpisodesInput,
): Promise<SyncTitleEpisodesResult> {
    const seasonsResult = await getTmdbTvSeasonsForUser(userId, { tmdbId: input.tmdbId });

    if (!seasonsResult.ok) {
        return seasonsResult;
    }

    const existingSeasons = new Map(
        (await listTvSeasonsForTitle(input.titleId)).map((season) => [season.seasonNumber, season]),
    );
    const existingEpisodes = new Map(
        (await listTvEpisodesForTitle(input.titleId)).map((episode) => [
            episodeKey(episode.seasonNumber, episode.episodeNumber),
            episode,
        ]),
    );

    const seasonIdByNumber = new Map<number, string>();
    const episodeIdByNumber = new Map<string, string>();
    const scopedSeasonNumbers = input.scope === "all" ? null : new Set(input.scope.seasons);
    let newEpisodeCount = 0;

    for (const season of seasonsResult.seasons) {
        const existingSeason = existingSeasons.get(season.seasonNumber);
        const decision = seasonMonitoring(input.policy, season.seasonNumber);
        const persistedSeason = await upsertTvSeason({
            titleId: input.titleId,
            seasonNumber: season.seasonNumber,
            episodeCount: season.episodeCount,
            ...(season.name !== null ? { title: season.name } : {}),
            ...(existingSeason
                ? decision.forceMonitored
                    ? { monitored: true }
                    : {}
                : { monitored: decision.monitoredOnInsert }),
        });

        seasonIdByNumber.set(season.seasonNumber, persistedSeason.id);

        if (scopedSeasonNumbers && !scopedSeasonNumbers.has(season.seasonNumber)) {
            continue;
        }

        const episodesResult = await getTmdbTvSeasonEpisodesForUser(userId, {
            tmdbId: input.tmdbId,
            seasonNumber: season.seasonNumber,
        });

        if (!episodesResult.ok) {
            continue;
        }

        for (const episode of episodesResult.episodes) {
            const key = episodeKey(episode.seasonNumber, episode.episodeNumber);
            const existingEpisode = existingEpisodes.get(key);
            const episodeDecision = episodeMonitoring(
                input.policy,
                episode.seasonNumber,
                episode.episodeNumber,
            );
            const persistedEpisode = await upsertTvEpisode({
                titleId: input.titleId,
                seasonId: persistedSeason.id,
                seasonNumber: episode.seasonNumber,
                episodeNumber: episode.episodeNumber,
                ...(episode.name !== null ? { title: episode.name } : {}),
                ...(episode.airDate !== null ? { airDate: episode.airDate } : {}),
                ...(existingEpisode
                    ? episodeDecision.forceMonitored
                        ? { monitored: true }
                        : {}
                    : { monitored: episodeDecision.monitoredOnInsert }),
            });

            episodeIdByNumber.set(key, persistedEpisode.id);

            if (!existingEpisode) {
                newEpisodeCount += 1;
            }
        }
    }

    return { ok: true, seasonIdByNumber, episodeIdByNumber, newEpisodeCount };
}
