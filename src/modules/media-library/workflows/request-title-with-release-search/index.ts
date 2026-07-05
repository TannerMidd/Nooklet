import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";
import {
  acquireMediaRequestAttempt,
  releaseMediaRequestAttempt,
} from "@/modules/media-library/repositories/media-request-attempts-repository";

import {
  validateRequestTitleWithReleaseSearchRequest,
  type RequestTitleWithReleaseSearchInput,
  requestTitleWithReleaseSearchInputSchema,
} from "./request-validation";
import { applyRequestedTitleMonitoring } from "./episode-monitoring-apply";
import { persistRequestedTitleStructure } from "./episode-sync";
import {
  loadExistingTitleRequest,
  requestExistingTitleContentInputSchema,
  validateRequestExistingTitleContentRequest,
  type RequestExistingTitleContentInput,
} from "./existing-title-request";
import { buildRequestAttemptKey } from "./request-fingerprint";
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
import {
  resolveEpisodeIdForTarget,
  resolveSeasonIdForTarget,
} from "./season-persistence";
import { requestWorkflowMediaTitle } from "./title-request";

export { requestTitleWithReleaseSearchInputSchema };
export type { RequestTitleWithReleaseSearchInput };
export type { ReleaseSelectionTarget };
export { requestExistingTitleContentInputSchema };
export type { RequestExistingTitleContentInput };
export { RequestExistingTitleContentWorkflowError } from "./existing-title-request";

export class RequestTitleAlreadyInFlightError extends Error {
  constructor() {
    super("A duplicate request for this title is already in flight. Try again shortly.");
    this.name = "RequestTitleAlreadyInFlightError";
  }
}

export type RequestTitleSelectionResult = {
  target: ReleaseSelectionTarget;
  seasonId: string | null;
  episodeId: string | null;
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

export type RequestTitleWithReleaseSearchResult = {
  title: MediaTitleRecord;
  selections: RequestTitleSelectionResult[];
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

/**
 * Shared request core: persist the requested structure, apply monitoring,
 * then search + queue a release per selection target. Both the new-title and
 * existing-title entry points run this under the in-flight request lock.
 */
async function executeTitleRequest(
  userId: string,
  request: RequestTitleWithReleaseSearchInput,
  title: MediaTitleRecord,
): Promise<RequestTitleWithReleaseSearchResult> {
  const targets = buildReleaseSelectionTargets(request);
  const persistedSelections = await persistRequestedTitleStructure(userId, request, title.id, targets);
  await applyRequestedTitleMonitoring(userId, targets, persistedSelections);
  const selectionResults: RequestTitleSelectionResult[] = [];

  for (const target of targets) {
    const releaseSearch = await searchRequestedTitleReleasesForTarget(userId, request, target);
    const seasonId = resolveSeasonIdForTarget(target, persistedSelections);
    const episodeId = resolveEpisodeIdForTarget(target, persistedSelections);
    const queuedDownload = await queueRequestedTitleRelease(userId, request, title, releaseSearch, {
      seasonId,
      episodeId,
      target,
    });

    selectionResults.push({ target, seasonId, episodeId, releaseSearch, queuedDownload });
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

export async function requestTitleWithReleaseSearchWorkflow(
  userId: string,
  input: RequestTitleWithReleaseSearchInput,
): Promise<RequestTitleWithReleaseSearchResult> {
  const request = validateRequestTitleWithReleaseSearchRequest(input);
  const requestKey = buildRequestAttemptKey(request);
  const acquired = await acquireMediaRequestAttempt(userId, requestKey);

  if (!acquired) {
    throw new RequestTitleAlreadyInFlightError();
  }

  try {
    const title = await requestWorkflowMediaTitle(userId, request);

    return await executeTitleRequest(userId, request, title);
  } finally {
    await releaseMediaRequestAttempt(userId, requestKey);
  }
}

export async function requestExistingTitleContentWorkflow(
  userId: string,
  input: unknown,
): Promise<RequestTitleWithReleaseSearchResult> {
  const parsed = validateRequestExistingTitleContentRequest(input);
  const { title, request } = await loadExistingTitleRequest(userId, parsed);
  const requestKey = buildRequestAttemptKey(request, { titleId: title.id });
  const acquired = await acquireMediaRequestAttempt(userId, requestKey);

  if (!acquired) {
    throw new RequestTitleAlreadyInFlightError();
  }

  try {
    return await executeTitleRequest(userId, request, title);
  } finally {
    await releaseMediaRequestAttempt(userId, requestKey);
  }
}
