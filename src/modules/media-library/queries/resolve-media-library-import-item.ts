import {
    findMediaTitleByIdForUser,
    findTvEpisodeByIdForUser,
    type MediaTitleRecord,
    type TvEpisodeRecord,
} from "@/modules/media-library/repositories/media-library-repository";

export type ResolvedMediaLibraryImportItem = {
    title: MediaTitleRecord | null;
    episode: TvEpisodeRecord | null;
};

export async function resolveMediaLibraryImportItem(
    userId: string,
    input: {
        titleId?: string | null;
        episodeId?: string | null;
    },
): Promise<ResolvedMediaLibraryImportItem> {
    const title = input.titleId ? await findMediaTitleByIdForUser(userId, input.titleId) : null;
    const episode = input.episodeId
        ? ((await findTvEpisodeByIdForUser(userId, input.episodeId))?.episode ?? null)
        : null;

    return { title, episode };
}
