import { upsertTvEpisode, upsertTvSeason } from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { type ReleaseSelectionTarget } from "./selection-targets";

export type PersistedSelectionIndex = {
  seasonIdByNumber: Map<number, string>;
  episodeIdByNumber: Map<string, string>;
};

function buildEpisodeKey(seasonNumber: number, episodeNumber: number) {
  return `${seasonNumber}:${episodeNumber}`;
}

export async function persistRequestedTitleSelections(
  request: RequestTitleWithReleaseSearchInput,
  titleId: string,
  targets: ReleaseSelectionTarget[],
): Promise<PersistedSelectionIndex> {
  const seasonIdByNumber = new Map<number, string>();
  const episodeIdByNumber = new Map<string, string>();

  if (request.mediaType !== "tv") {
    return { seasonIdByNumber, episodeIdByNumber };
  }

  const seasonsToPersist = new Map<number, { monitored: boolean }>();
  const episodesToPersist: Array<{ season: number; episode: number }> = [];

  for (const target of targets) {
    if (target.kind === "season") {
      seasonsToPersist.set(target.season, { monitored: true });
    } else if (target.kind === "episode") {
      const existing = seasonsToPersist.get(target.season);
      seasonsToPersist.set(target.season, { monitored: existing?.monitored ?? false });
      episodesToPersist.push({ season: target.season, episode: target.episode });
    }
  }

  for (const [seasonNumber, { monitored }] of seasonsToPersist) {
    const season = await upsertTvSeason({
      titleId,
      seasonNumber,
      monitored,
    });
    seasonIdByNumber.set(seasonNumber, season.id);
  }

  for (const { season, episode } of episodesToPersist) {
    const seasonId = seasonIdByNumber.get(season);

    if (!seasonId) {
      continue;
    }

    const persisted = await upsertTvEpisode({
      titleId,
      seasonId,
      seasonNumber: season,
      episodeNumber: episode,
    });
    episodeIdByNumber.set(buildEpisodeKey(season, episode), persisted.id);
  }

  return { seasonIdByNumber, episodeIdByNumber };
}

export function resolveSeasonIdForTarget(
  target: ReleaseSelectionTarget,
  index: PersistedSelectionIndex,
): string | null {
  if (target.kind === "season") {
    return index.seasonIdByNumber.get(target.season) ?? null;
  }

  if (target.kind === "episode") {
    return index.seasonIdByNumber.get(target.season) ?? null;
  }

  return null;
}
