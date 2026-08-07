import {
    findMediaTitleByIdForUser,
    findTvEpisodeByIdForUser,
    findTvSeasonByIdForUser,
    type MediaTitleRecord,
    type TvEpisodeRecord,
    type TvSeasonRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { SearchLibraryItemReleasesWorkflowError } from "./errors";
type ResolveLibrarySearchItemRequest = {
    titleId: string;
    seasonId?: string;
    episodeId?: string;
    targetLibraryPathId?: string | null;
};

export type ResolvedLibrarySearchItem = {
    title: MediaTitleRecord;
    season: TvSeasonRecord | null;
    episode: TvEpisodeRecord | null;
    targetLibraryPathId: string | null;
};

export async function resolveLibrarySearchItem(
    userId: string,
    request: ResolveLibrarySearchItemRequest,
): Promise<ResolvedLibrarySearchItem> {
    const title = await findMediaTitleByIdForUser(userId, request.titleId);

    if (!title) {
        throw new SearchLibraryItemReleasesWorkflowError(
            "title_not_found",
            "Library title was not found.",
        );
    }

    const targetLibraryPathId = request.targetLibraryPathId ?? null;

    if (request.seasonId) {
        const season = await findTvSeasonByIdForUser(userId, request.seasonId);

        if (!season) {
            throw new SearchLibraryItemReleasesWorkflowError(
                "season_not_found",
                "Season was not found.",
            );
        }

        if (season.title.id !== title.id) {
            throw new SearchLibraryItemReleasesWorkflowError(
                "season_title_mismatch",
                "Season does not belong to that library title.",
            );
        }

        return { title, season: season.season, episode: null, targetLibraryPathId };
    }

    if (!request.episodeId) {
        return { title, season: null, episode: null, targetLibraryPathId };
    }

    const episode = await findTvEpisodeByIdForUser(userId, request.episodeId);

    if (!episode) {
        throw new SearchLibraryItemReleasesWorkflowError(
            "episode_not_found",
            "Episode was not found.",
        );
    }

    if (episode.title.id !== title.id) {
        throw new SearchLibraryItemReleasesWorkflowError(
            "episode_title_mismatch",
            "Episode does not belong to that library title.",
        );
    }

    return { title, season: null, episode: episode.episode, targetLibraryPathId };
}
