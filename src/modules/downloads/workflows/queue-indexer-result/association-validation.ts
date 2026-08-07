import {
    findMediaTitleByIdForUser,
    findTvEpisodeByIdForUser,
    findTvSeasonByIdForUser,
} from "@/modules/media-library/public";

import { QueueIndexerResultWorkflowError } from "./errors";
import { type QueueIndexerResultInput } from "./request-validation";
import { type ResolvedQueueIndexerResult } from "./result-resolution";

function invalidAssociation(message: string): never {
    throw new QueueIndexerResultWorkflowError("invalid_media_association", message);
}

export async function validateQueueIndexerResultAssociations(
    userId: string,
    request: QueueIndexerResultInput,
    resolvedResult: ResolvedQueueIndexerResult,
) {
    if (!request.mediaTitleId) {
        if (request.episodeId || request.seasonId) {
            invalidAssociation("A season or episode must be attached to a library title.");
        }

        return;
    }

    const title = await findMediaTitleByIdForUser(userId, request.mediaTitleId);

    if (!title) {
        invalidAssociation("The selected library title no longer exists.");
    }

    if (title.mediaType !== resolvedResult.result.mediaType) {
        invalidAssociation("The selected release does not match the library title's media type.");
    }

    const season = request.seasonId
        ? await findTvSeasonByIdForUser(userId, request.seasonId)
        : null;

    if (request.seasonId && (!season || season.title.id !== title.id)) {
        invalidAssociation("The selected season does not belong to that library title.");
    }

    const episode = request.episodeId
        ? await findTvEpisodeByIdForUser(userId, request.episodeId)
        : null;

    if (request.episodeId && (!episode || episode.title.id !== title.id)) {
        invalidAssociation("The selected episode does not belong to that library title.");
    }

    if (episode && season && episode.episode.seasonId !== season.season.id) {
        invalidAssociation("The selected episode does not belong to that season.");
    }
}
