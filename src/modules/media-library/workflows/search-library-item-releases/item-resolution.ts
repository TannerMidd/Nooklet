import {
  findMediaTitleByIdForUser,
  findTvEpisodeByIdForUser,
  type MediaTitleRecord,
  type TvEpisodeRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { SearchLibraryItemReleasesWorkflowError } from "./errors";
type ResolveLibrarySearchItemRequest = {
  titleId: string;
  episodeId?: string;
  targetLibraryPathId?: string | null;
};

export type ResolvedLibrarySearchItem = {
  title: MediaTitleRecord;
  episode: TvEpisodeRecord | null;
  targetLibraryPathId: string | null;
};

export async function resolveLibrarySearchItem(
  userId: string,
  request: ResolveLibrarySearchItemRequest,
): Promise<ResolvedLibrarySearchItem> {
  const title = await findMediaTitleByIdForUser(userId, request.titleId);

  if (!title) {
    throw new SearchLibraryItemReleasesWorkflowError("title_not_found", "Library title was not found.");
  }

  if (!request.episodeId) {
    return { title, episode: null, targetLibraryPathId: request.targetLibraryPathId ?? null };
  }

  const episode = await findTvEpisodeByIdForUser(userId, request.episodeId);

  if (!episode) {
    throw new SearchLibraryItemReleasesWorkflowError("episode_not_found", "Episode was not found.");
  }

  if (episode.title.id !== title.id) {
    throw new SearchLibraryItemReleasesWorkflowError(
      "episode_title_mismatch",
      "Episode does not belong to that library title.",
    );
  }

  return { title, episode: episode.episode, targetLibraryPathId: request.targetLibraryPathId ?? null };
}
