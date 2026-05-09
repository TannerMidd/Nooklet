import {
  lookupTmdbTvSeasonEpisodes,
  lookupTmdbTvSeasons,
  type TmdbTvEpisodeSummary,
  type TmdbTvSeasonSummary,
} from "@/modules/service-connections/adapters/tmdb";
import { getVerifiedTmdbConnection } from "@/modules/service-connections/queries/get-verified-tmdb-connection";

export type GetTmdbTvSeasonsResult =
  | { ok: true; seasons: TmdbTvSeasonSummary[] }
  | {
      ok: false;
      reason: "tmdb-not-configured" | "tmdb-error";
      message: string;
    };

export async function getTmdbTvSeasonsForUser(
  userId: string,
  input: { tmdbId: number },
): Promise<GetTmdbTvSeasonsResult> {
  const tmdbConnection = await getVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings -> Connections to choose seasons.",
    };
  }

  const result = await lookupTmdbTvSeasons({ ...tmdbConnection, tmdbId: input.tmdbId });

  if (!result.ok) {
    return { ok: false, reason: "tmdb-error", message: result.message };
  }

  return { ok: true, seasons: result.seasons };
}

export type GetTmdbTvSeasonEpisodesResult =
  | { ok: true; seasonNumber: number; episodes: TmdbTvEpisodeSummary[] }
  | {
      ok: false;
      reason: "tmdb-not-configured" | "tmdb-error";
      message: string;
    };

export async function getTmdbTvSeasonEpisodesForUser(
  userId: string,
  input: { tmdbId: number; seasonNumber: number },
): Promise<GetTmdbTvSeasonEpisodesResult> {
  const tmdbConnection = await getVerifiedTmdbConnection(userId);

  if (!tmdbConnection) {
    return {
      ok: false,
      reason: "tmdb-not-configured",
      message: "Verify a TMDB connection in Settings -> Connections to choose episodes.",
    };
  }

  const result = await lookupTmdbTvSeasonEpisodes({
    ...tmdbConnection,
    tmdbId: input.tmdbId,
    seasonNumber: input.seasonNumber,
  });

  if (!result.ok) {
    return { ok: false, reason: "tmdb-error", message: result.message };
  }

  return { ok: true, seasonNumber: result.seasonNumber, episodes: result.episodes };
}
