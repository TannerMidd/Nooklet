import { type ResolvedLibrarySearchItem } from "./item-resolution";
import {
  queueLibraryItemRelease,
  type LibraryItemQueuedDownload,
} from "./release-queueing";
import {
  searchLibraryItemReleases,
  type LibraryItemReleaseSearch,
} from "./release-search";
import {
  searchLibraryItemReleasesInputSchema,
  type SearchLibraryItemReleasesInput,
  validateSearchLibraryItemReleasesRequest,
} from "./request-validation";
import { resolveLibrarySearchItem } from "./item-resolution";

export { searchLibraryItemReleasesInputSchema };
export { SearchLibraryItemReleasesWorkflowError } from "./errors";
export type { SearchLibraryItemReleasesInput };

export type SearchLibraryItemReleasesResult = {
  item: ResolvedLibrarySearchItem;
  releaseSearch: LibraryItemReleaseSearch;
  queuedDownload: LibraryItemQueuedDownload;
};

export async function searchLibraryItemReleasesWorkflow(
  userId: string,
  input: SearchLibraryItemReleasesInput,
): Promise<SearchLibraryItemReleasesResult> {
  const request = validateSearchLibraryItemReleasesRequest(input);
  const item = await resolveLibrarySearchItem(userId, request);
  const releaseSearch = await searchLibraryItemReleases(userId, item);
  const queuedDownload = await queueLibraryItemRelease(userId, item, releaseSearch, {
    excludedResultIds: request.excludedResultIds,
    excludedReleaseKeys: request.excludedReleaseKeys,
  });

  return { item, releaseSearch, queuedDownload };
}
