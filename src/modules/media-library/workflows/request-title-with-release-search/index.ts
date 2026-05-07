import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";

import {
  validateRequestTitleWithReleaseSearchRequest,
  type RequestTitleWithReleaseSearchInput,
  requestTitleWithReleaseSearchInputSchema,
} from "./request-validation";
import {
  queueRequestedTitleRelease,
  type RequestedTitleQueuedDownload,
} from "./release-queueing";
import {
  searchRequestedTitleReleases,
  type RequestedTitleReleaseSearch,
} from "./release-search";
import { requestWorkflowMediaTitle } from "./title-request";

export { requestTitleWithReleaseSearchInputSchema };
export type { RequestTitleWithReleaseSearchInput };

export type RequestTitleWithReleaseSearchResult = {
  title: MediaTitleRecord;
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

export async function requestTitleWithReleaseSearchWorkflow(
  userId: string,
  input: RequestTitleWithReleaseSearchInput,
): Promise<RequestTitleWithReleaseSearchResult> {
  const request = validateRequestTitleWithReleaseSearchRequest(input);
  const title = await requestWorkflowMediaTitle(userId, request);
  const releaseSearch = await searchRequestedTitleReleases(userId, request);
  const queuedDownload = await queueRequestedTitleRelease(userId, request, title, releaseSearch);

  return { title, releaseSearch, queuedDownload };
}
