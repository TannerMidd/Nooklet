import { type TvRequestSelections } from "@/modules/media-library/schemas/request-media-title";
import {
    syncTitleEpisodesWorkflow,
    type SyncTitleEpisodesScope,
} from "@/modules/media-library/workflows/sync-title-episodes";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import {
    persistRequestedTitleSelections,
    type PersistedSelectionIndex,
} from "./season-persistence";
import { type ReleaseSelectionTarget } from "./selection-targets";

function scopeFromSelections(selections: TvRequestSelections | undefined): SyncTitleEpisodesScope {
    if (!selections || selections.mode === "all") {
        return "all";
    }

    if (selections.mode === "seasons") {
        return { seasons: selections.seasons };
    }

    return { seasons: [selections.season] };
}

/**
 * Persists the requested title's season/episode structure. When a TMDB id is
 * available the full structure (titles, air dates, episode counts) is synced
 * so monitoring automation can see unaired/missing episodes; otherwise it
 * degrades to bare season/episode rows for the explicit selections. A TMDB
 * outage must never fail the request itself.
 */
export async function persistRequestedTitleStructure(
    userId: string,
    request: RequestTitleWithReleaseSearchInput,
    titleId: string,
    targets: ReleaseSelectionTarget[],
): Promise<PersistedSelectionIndex> {
    if (request.mediaType !== "tv") {
        return { seasonIdByNumber: new Map(), episodeIdByNumber: new Map() };
    }

    if (request.tmdbId) {
        const synced = await syncTitleEpisodesWorkflow(userId, {
            titleId,
            tmdbId: request.tmdbId,
            scope: scopeFromSelections(request.selections),
            policy: { kind: "selections", selections: request.selections ?? { mode: "all" } },
        });

        if (synced.ok) {
            return {
                seasonIdByNumber: synced.seasonIdByNumber,
                episodeIdByNumber: synced.episodeIdByNumber,
            };
        }
    }

    return persistRequestedTitleSelections(request, titleId, targets);
}
