import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

export type ReleaseSelectionTarget =
  | { kind: "all" }
  | { kind: "season"; season: number }
  | { kind: "episode"; season: number; episode: number };

export function buildReleaseSelectionTargets(
  request: RequestTitleWithReleaseSearchInput,
): ReleaseSelectionTarget[] {
  if (request.mediaType !== "tv" || !request.selections) {
    return [{ kind: "all" }];
  }

  const selections = request.selections;

  if (selections.mode === "all") {
    return [{ kind: "all" }];
  }

  if (selections.mode === "seasons") {
    return selections.seasons.map((season) => ({ kind: "season", season }));
  }

  return selections.episodes.map((episode) => ({
    kind: "episode",
    season: selections.season,
    episode,
  }));
}

export function describeReleaseSelectionTarget(target: ReleaseSelectionTarget): string {
  if (target.kind === "all") {
    return "all";
  }

  if (target.kind === "season") {
    return `season ${target.season}`;
  }

  return `S${String(target.season).padStart(2, "0")}E${String(target.episode).padStart(2, "0")}`;
}
