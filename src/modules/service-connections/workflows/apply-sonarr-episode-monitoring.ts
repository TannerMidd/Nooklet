import {
  ensureSonarrSeasonsMonitored,
  listSonarrEpisodes,
  searchSonarrEpisodes,
  setSonarrEpisodesMonitored,
} from "@/modules/service-connections/adapters/sonarr-episodes";

export type ApplySonarrEpisodeMonitoringDependencies = {
  listEpisodes?: typeof listSonarrEpisodes;
  setMonitored?: typeof setSonarrEpisodesMonitored;
  searchEpisodes?: typeof searchSonarrEpisodes;
  ensureSeasonsMonitored?: typeof ensureSonarrSeasonsMonitored;
};

export type ApplySonarrEpisodeMonitoringInput = {
  baseUrl: string;
  apiKey: string;
  seriesId: number;
  requestedEpisodeIds: number[];
};

export type ApplySonarrEpisodeMonitoringResult =
  | {
      ok: true;
      monitoredEpisodeCount: number;
      unmonitoredEpisodeCount: number;
      searchTriggered: boolean;
      searchWarning?: string;
    }
  | {
      ok: false;
      stage: "list" | "monitor" | "unmonitor" | "ensure-seasons";
      message: string;
      field?: "episodeIds";
    };

export async function applySonarrEpisodeMonitoring(
  input: ApplySonarrEpisodeMonitoringInput,
  dependencies: ApplySonarrEpisodeMonitoringDependencies = {},
): Promise<ApplySonarrEpisodeMonitoringResult> {
  const listEpisodes = dependencies.listEpisodes ?? listSonarrEpisodes;
  const setMonitored = dependencies.setMonitored ?? setSonarrEpisodesMonitored;
  const searchEpisodes = dependencies.searchEpisodes ?? searchSonarrEpisodes;
  const ensureSeasonsMonitored =
    dependencies.ensureSeasonsMonitored ?? ensureSonarrSeasonsMonitored;

  const listResult = await listEpisodes({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    seriesId: input.seriesId,
  });

  if (!listResult.ok) {
    return { ok: false, stage: "list", message: listResult.message };
  }

  const availableIds = new Set(listResult.episodes.map((episode) => episode.id));
  const requestedIds = Array.from(new Set(input.requestedEpisodeIds));

  if (requestedIds.some((episodeId) => !availableIds.has(episodeId))) {
    return {
      ok: false,
      stage: "monitor",
      message: "Select only episodes returned by Sonarr for this series.",
      field: "episodeIds",
    };
  }

  const monitoredIdsToDisable = listResult.episodes
    .filter((episode) => episode.monitored && !requestedIds.includes(episode.id))
    .map((episode) => episode.id);

  const requestedSeasonNumbers = Array.from(
    new Set(
      listResult.episodes
        .filter((episode) => requestedIds.includes(episode.id))
        .map((episode) => episode.seasonNumber),
    ),
  );

  if (requestedSeasonNumbers.length > 0) {
    const ensureResult = await ensureSeasonsMonitored({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      seriesId: input.seriesId,
      seasonNumbers: requestedSeasonNumbers,
    });

    if (!ensureResult.ok) {
      return { ok: false, stage: "ensure-seasons", message: ensureResult.message };
    }
  }

  if (monitoredIdsToDisable.length > 0) {
    const disableResult = await setMonitored({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      episodeIds: monitoredIdsToDisable,
      monitored: false,
    });

    if (!disableResult.ok) {
      return { ok: false, stage: "unmonitor", message: disableResult.message };
    }
  }

  const enableResult = await setMonitored({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    episodeIds: requestedIds,
    monitored: true,
  });

  if (!enableResult.ok) {
    return { ok: false, stage: "monitor", message: enableResult.message };
  }

  const searchResult = await searchEpisodes({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
    episodeIds: requestedIds,
  });

  return {
    ok: true,
    monitoredEpisodeCount: requestedIds.length,
    unmonitoredEpisodeCount: monitoredIdsToDisable.length,
    searchTriggered: searchResult.ok,
    searchWarning: searchResult.ok ? undefined : searchResult.message,
  };
}
