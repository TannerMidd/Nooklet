import { searchIndexersWorkflow } from "@/modules/indexers/workflows/search-indexers";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { type ReleaseSelectionTarget } from "./selection-targets";

type IndexerSearchWorkflowResult = Awaited<ReturnType<typeof searchIndexersWorkflow>>;

export type RequestedTitleReleaseSearch =
  | { searched: false }
  | {
      searched: true;
      searchRun: IndexerSearchWorkflowResult["searchRun"];
      results: IndexerSearchWorkflowResult["results"];
    };

function buildReleaseSearchQuery(request: RequestTitleWithReleaseSearchInput, target: ReleaseSelectionTarget) {
  const base = `${request.title}${request.year ? ` ${request.year}` : ""}`;

  if (target.kind === "season") {
    return `${base} S${String(target.season).padStart(2, "0")}`;
  }

  if (target.kind === "episode") {
    return `${base} S${String(target.season).padStart(2, "0")}E${String(target.episode).padStart(2, "0")}`;
  }

  return base;
}

export async function searchRequestedTitleReleasesForTarget(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
  target: ReleaseSelectionTarget,
): Promise<RequestedTitleReleaseSearch> {
  if (!request.downloadNow) {
    return { searched: false };
  }

  const search = await searchIndexersWorkflow(userId, {
    mediaType: request.mediaType,
    query: buildReleaseSearchQuery(request, target),
    ...(target.kind === "season" || target.kind === "episode" ? { season: target.season } : {}),
    ...(target.kind === "episode" ? { episode: target.episode } : {}),
  });

  return {
    searched: true,
    searchRun: search.searchRun,
    results: search.results,
  };
}

export async function searchRequestedTitleReleases(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
): Promise<RequestedTitleReleaseSearch> {
  return searchRequestedTitleReleasesForTarget(userId, request, { kind: "all" });
}
