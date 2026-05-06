import { searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

type IndexerSearchWorkflowResult = Awaited<ReturnType<typeof searchIndexersWorkflow>>;

export type RequestedTitleReleaseSearch =
  | { searched: false }
  | {
      searched: true;
      searchRun: IndexerSearchWorkflowResult["searchRun"];
      results: IndexerSearchWorkflowResult["results"];
    };

function buildReleaseSearchQuery(request: RequestTitleWithReleaseSearchInput) {
  return `${request.title}${request.year ? ` ${request.year}` : ""}`;
}

export async function searchRequestedTitleReleases(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
): Promise<RequestedTitleReleaseSearch> {
  if (!request.downloadNow) {
    return { searched: false };
  }

  const search = await searchIndexersWorkflow(userId, {
    mediaType: request.mediaType,
    query: buildReleaseSearchQuery(request),
  });

  return {
    searched: true,
    searchRun: search.searchRun,
    results: search.results,
  };
}
