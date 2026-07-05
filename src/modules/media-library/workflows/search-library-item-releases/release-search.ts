import { searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";

import { type ResolvedLibrarySearchItem } from "./item-resolution";

type IndexerSearchWorkflowResult = Awaited<ReturnType<typeof searchIndexersWorkflow>>;

export type LibraryItemReleaseSearch = {
  searched: true;
  query: string;
  searchRun: IndexerSearchWorkflowResult["searchRun"];
  results: IndexerSearchWorkflowResult["results"];
};

function episodeCode(seasonNumber: number, episodeNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}E${String(episodeNumber).padStart(2, "0")}`;
}

function seasonCode(seasonNumber: number) {
  return `S${String(seasonNumber).padStart(2, "0")}`;
}

export function buildLibraryItemReleaseSearchQuery(item: ResolvedLibrarySearchItem) {
  if (item.episode) {
    return `${item.title.title} ${episodeCode(item.episode.seasonNumber, item.episode.episodeNumber)}`;
  }

  if (item.season) {
    return `${item.title.title} ${seasonCode(item.season.seasonNumber)}`;
  }

  return `${item.title.title}${item.title.year ? ` ${item.title.year}` : ""}`;
}

export async function searchLibraryItemReleases(
  userId: string,
  item: ResolvedLibrarySearchItem,
): Promise<LibraryItemReleaseSearch> {
  const query = buildLibraryItemReleaseSearchQuery(item);
  const search = await searchIndexersWorkflow(userId, {
    mediaType: item.title.mediaType,
    query,
    ...(item.season ? { season: item.season.seasonNumber } : {}),
    ...(item.episode ? { season: item.episode.seasonNumber, episode: item.episode.episodeNumber } : {}),
  });

  return {
    searched: true,
    query,
    searchRun: search.searchRun,
    results: search.results,
  };
}
