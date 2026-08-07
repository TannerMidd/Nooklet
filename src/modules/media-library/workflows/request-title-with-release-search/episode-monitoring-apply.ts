import {
    updateTvEpisodeMonitoring,
    updateTvSeasonMonitoring,
} from "@/modules/media-library/repositories/media-library-repository";

import { type PersistedSelectionIndex } from "./season-persistence";
import { type ReleaseSelectionTarget } from "./selection-targets";

function buildEpisodeKey(seasonNumber: number, episodeNumber: number) {
    return `${seasonNumber}:${episodeNumber}`;
}

/**
 * Force `monitored = true` on the persisted seasons/episodes the user just
 * requested. Idempotent: re-running with the same targets is a no-op.
 *
 * This phase exists so requested episodes that already exist in our DB (from
 * a prior season-level request, a scan, or a TMDB sync) but were later marked
 * `monitored = false` get re-monitored when explicitly re-requested.
 */
export async function applyRequestedTitleMonitoring(
    userId: string,
    targets: ReleaseSelectionTarget[],
    index: PersistedSelectionIndex,
): Promise<void> {
    for (const target of targets) {
        if (target.kind === "all") {
            continue;
        }

        if (target.kind === "season") {
            const seasonId = index.seasonIdByNumber.get(target.season);

            if (!seasonId) {
                continue;
            }

            await updateTvSeasonMonitoring({ userId, seasonId, monitored: true });
            continue;
        }

        const episodeId = index.episodeIdByNumber.get(
            buildEpisodeKey(target.season, target.episode),
        );

        if (!episodeId) {
            continue;
        }

        await updateTvEpisodeMonitoring({ userId, episodeId, monitored: true });
    }
}
