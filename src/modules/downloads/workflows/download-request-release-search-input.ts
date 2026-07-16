import { type SearchLibraryItemReleasesInput } from "@/modules/media-library/workflows/search-library-item-releases";

type StoredDownloadRequestReleaseTarget = {
  mediaTitleId: string;
  episodeId?: string | null;
  seasonId?: string | null;
  targetLibraryPathId?: string | null;
};

type ReleaseExclusions = {
  resultIds: string[];
  releaseKeys: string[];
};

export function buildDownloadRequestReleaseSearchInput(
  request: StoredDownloadRequestReleaseTarget,
  exclusions: ReleaseExclusions,
): SearchLibraryItemReleasesInput {
  const itemScope = request.episodeId
    ? { episodeId: request.episodeId }
    : request.seasonId
      ? { seasonId: request.seasonId }
      : {};

  return {
    titleId: request.mediaTitleId,
    ...itemScope,
    ...(request.targetLibraryPathId
      ? { targetLibraryPathId: request.targetLibraryPathId }
      : {}),
    excludedResultIds: exclusions.resultIds,
    excludedReleaseKeys: exclusions.releaseKeys,
  };
}
