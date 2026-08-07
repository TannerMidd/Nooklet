import { type ReleaseSelectionTarget } from "@/modules/media-library/release-selection";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

export type { ReleaseSelectionTarget };

export function buildReleaseSelectionTargets(
    request: RequestTitleWithReleaseSearchInput,
): ReleaseSelectionTarget[] {
    if (request.mediaType !== "tv" || !request.selections) {
        return [{ kind: "all", mediaType: request.mediaType }];
    }

    const selections = request.selections;

    if (selections.mode === "all") {
        return [{ kind: "all", mediaType: "tv" }];
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
