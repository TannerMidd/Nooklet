import { searchLibraryItemReleasesWorkflow } from "@/modules/media-library/workflows/search-library-item-releases";

import { type MissingContentCandidate } from "./candidate-selection";

export type MissingContentDispatchOutcome = {
    candidate: MissingContentCandidate;
    queued: boolean;
    message: string | null;
};

export async function dispatchMissingContentSearches(
    userId: string,
    candidates: MissingContentCandidate[],
): Promise<MissingContentDispatchOutcome[]> {
    const outcomes: MissingContentDispatchOutcome[] = [];

    for (const candidate of candidates) {
        try {
            const result = await searchLibraryItemReleasesWorkflow(userId, {
                titleId: candidate.titleId,
                episodeId: candidate.episodeId ?? undefined,
            });

            outcomes.push({
                candidate,
                queued: result.queuedDownload.queued,
                message: result.queuedDownload.queued ? null : result.queuedDownload.message,
            });
        } catch (error) {
            outcomes.push({
                candidate,
                queued: false,
                message:
                    error instanceof Error
                        ? error.message
                        : "Missing-content search failed unexpectedly.",
            });
        }
    }

    return outcomes;
}
