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
  searchRequestedTitleReleasesForTarget,
  type RequestedTitleReleaseSearch,
} from "./release-search";
import {
  buildReleaseSelectionTargets,
  type ReleaseSelectionTarget,
} from "./selection-targets";
import { requestWorkflowMediaTitle } from "./title-request";

export { requestTitleWithReleaseSearchInputSchema };
export type { RequestTitleWithReleaseSearchInput };
export type { ReleaseSelectionTarget };

export type RequestTitleSelectionResult = {
  target: ReleaseSelectionTarget;
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

export type RequestTitleWithReleaseSearchResult = {
  title: MediaTitleRecord;
  selections: RequestTitleSelectionResult[];
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

export async function requestTitleWithReleaseSearchWorkflow(
  userId: string,
  input: RequestTitleWithReleaseSearchInput,
): Promise<RequestTitleWithReleaseSearchResult> {
  const request = validateRequestTitleWithReleaseSearchRequest(input);
  const title = await requestWorkflowMediaTitle(userId, request);
  const targets = buildReleaseSelectionTargets(request);
  const selectionResults: RequestTitleSelectionResult[] = [];

  for (const target of targets) {
    const releaseSearch = await searchRequestedTitleReleasesForTarget(userId, request, target);
    const queuedDownload = await queueRequestedTitleRelease(userId, request, title, releaseSearch);

    selectionResults.push({ target, releaseSearch, queuedDownload });
  }

  const primary = selectionResults[0];

  return {
    title,
    selections: selectionResults,
    releaseSearch: primary?.releaseSearch ?? { searched: false },
    queuedDownload: primary?.queuedDownload ?? {
      queued: false,
      reason: "not_requested",
      message: null,
      selectedResultId: null,
      rejectedResultIds: [],
      download: null,
    },
  };
}
