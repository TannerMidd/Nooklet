import { type TvRequestSelections } from "@/modules/media-library/schemas/request-media-title";

/**
 * Controls the monitored flag written during an episode sync.
 *
 * - `selections`: a user request; explicitly selected seasons/episodes are
 *   monitored (and re-monitored if they already existed), unselected rows are
 *   persisted for structure but left unmonitored.
 * - `refresh`: the scheduled metadata refresh; existing rows are never
 *   touched, new rows inherit the title's monitored flag.
 */
export type EpisodeSyncMonitoringPolicy =
  | { kind: "selections"; selections: TvRequestSelections }
  | { kind: "refresh"; titleMonitored: boolean };

export type MonitoringDecision = {
  monitoredOnInsert: boolean;
  forceMonitored: boolean;
};

const SPECIALS_SEASON_NUMBER = 0;

export function seasonMonitoring(
  policy: EpisodeSyncMonitoringPolicy,
  seasonNumber: number,
): MonitoringDecision {
  if (policy.kind === "refresh") {
    return {
      monitoredOnInsert: policy.titleMonitored && seasonNumber !== SPECIALS_SEASON_NUMBER,
      forceMonitored: false,
    };
  }

  const selections = policy.selections;

  if (selections.mode === "all") {
    // Specials stay unmonitored by default when requesting an entire series.
    return { monitoredOnInsert: seasonNumber !== SPECIALS_SEASON_NUMBER, forceMonitored: false };
  }

  if (selections.mode === "seasons") {
    const selected = selections.seasons.includes(seasonNumber);
    return { monitoredOnInsert: selected, forceMonitored: selected };
  }

  const selected = selections.season === seasonNumber;
  return { monitoredOnInsert: selected, forceMonitored: selected };
}

export function episodeMonitoring(
  policy: EpisodeSyncMonitoringPolicy,
  seasonNumber: number,
  episodeNumber: number,
): MonitoringDecision {
  if (policy.kind === "refresh") {
    return {
      monitoredOnInsert: policy.titleMonitored && seasonNumber !== SPECIALS_SEASON_NUMBER,
      forceMonitored: false,
    };
  }

  const selections = policy.selections;

  if (selections.mode === "all") {
    return { monitoredOnInsert: seasonNumber !== SPECIALS_SEASON_NUMBER, forceMonitored: false };
  }

  if (selections.mode === "seasons") {
    const selected = selections.seasons.includes(seasonNumber);
    return { monitoredOnInsert: selected, forceMonitored: selected };
  }

  const selected = selections.season === seasonNumber
    && selections.episodes.includes(episodeNumber);
  return { monitoredOnInsert: selected, forceMonitored: selected };
}
