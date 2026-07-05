import { type QueuedIndexerResultDownload } from "@/modules/downloads/workflows/queue-indexer-result";
import {
  queueReleaseCandidates,
  selectReleaseCandidates,
} from "@/modules/media-library/release-selection";
import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";
import { type RequestedTitleReleaseSearch } from "./release-search";
import { type ReleaseSelectionTarget } from "./selection-targets";

type ReleaseSearchResult = Extract<RequestedTitleReleaseSearch, { searched: true }>["results"][number];

export type RequestedTitleQueuedDownload =
  | {
      queued: false;
      reason: "not_requested" | "search_not_run" | "search_failed" | "no_matching_release" | "queue_failed";
      message: string | null;
      selectedResultId: null;
      rejectedResultIds: string[];
      download: null;
    }
  | {
      queued: true;
      reason: "queued";
      message: null;
      selectedResultId: string;
      rejectedResultIds: string[];
      download: QueuedIndexerResultDownload;
    };

export function selectRequestedTitleReleaseCandidates(
  request: RequestTitleWithReleaseSearchInput,
  results: ReleaseSearchResult[],
  target: ReleaseSelectionTarget | null = null,
) {
  return selectReleaseCandidates(results, {
    qualityProfile: request.qualityProfile,
    target,
  });
}

export async function queueRequestedTitleRelease(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
  title: MediaTitleRecord,
  releaseSearch: RequestedTitleReleaseSearch,
  options: {
    seasonId?: string | null;
    episodeId?: string | null;
    target?: ReleaseSelectionTarget;
  } = {},
): Promise<RequestedTitleQueuedDownload> {
  if (!request.downloadNow) {
    return {
      queued: false,
      reason: "not_requested",
      message: null,
      selectedResultId: null,
      rejectedResultIds: [],
      download: null,
    };
  }

  if (!releaseSearch.searched) {
    return {
      queued: false,
      reason: "search_not_run",
      message: null,
      selectedResultId: null,
      rejectedResultIds: [],
      download: null,
    };
  }

  if (releaseSearch.searchRun.status === "failed") {
    return {
      queued: false,
      reason: "search_failed",
      message: releaseSearch.searchRun.errorMessage,
      selectedResultId: null,
      rejectedResultIds: [],
      download: null,
    };
  }

  const candidates = selectRequestedTitleReleaseCandidates(
    request,
    releaseSearch.results,
    options.target ?? null,
  );

  if (candidates.length === 0) {
    return {
      queued: false,
      reason: "no_matching_release",
      message: null,
      selectedResultId: null,
      rejectedResultIds: [],
      download: null,
    };
  }

  return queueReleaseCandidates(userId, candidates, {
    mediaTitleId: title.id,
    requestedTitle: title.title,
    targetLibraryId: title.libraryId,
    targetLibraryPathId: request.targetLibraryPathId ?? null,
    seasonId: options.seasonId,
    episodeId: options.episodeId,
  });
}
