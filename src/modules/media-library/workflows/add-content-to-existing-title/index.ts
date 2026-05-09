import { type MediaTitleRecord } from "@/modules/media-library/repositories/media-library-repository";

import {
  queueRequestedTitleRelease,
  type RequestedTitleQueuedDownload,
} from "../request-title-with-release-search/release-queueing";
import {
  searchRequestedTitleReleasesForTarget,
  type RequestedTitleReleaseSearch,
} from "../request-title-with-release-search/release-search";
import {
  buildReleaseSelectionTargets,
  type ReleaseSelectionTarget,
} from "../request-title-with-release-search/selection-targets";
import {
  persistRequestedTitleSelections,
  resolveSeasonIdForTarget,
} from "../request-title-with-release-search/season-persistence";

import {
  validateAddContentToExistingTitleRequest,
  type AddContentToExistingTitleInput,
} from "./request-validation";
import { loadExistingTitleForAddContent } from "./title-loading";

export {
  AddContentToExistingTitleWorkflowError,
} from "./title-loading";

export type AddContentSelectionResult = {
  target: ReleaseSelectionTarget;
  releaseSearch: RequestedTitleReleaseSearch;
  queuedDownload: RequestedTitleQueuedDownload;
};

export type AddContentToExistingTitleResult = {
  title: MediaTitleRecord;
  selections: AddContentSelectionResult[];
};

export async function addContentToExistingTitleWorkflow(
  userId: string,
  input: AddContentToExistingTitleInput,
): Promise<AddContentToExistingTitleResult> {
  const parsed = validateAddContentToExistingTitleRequest(input);
  const { title, request } = await loadExistingTitleForAddContent(userId, parsed);
  const targets = buildReleaseSelectionTargets(request);
  const persistedSelections = await persistRequestedTitleSelections(request, title.id, targets);
  const selectionResults: AddContentSelectionResult[] = [];

  for (const target of targets) {
    const releaseSearch = await searchRequestedTitleReleasesForTarget(userId, request, target);
    const seasonId = resolveSeasonIdForTarget(target, persistedSelections);
    const queuedDownload = await queueRequestedTitleRelease(userId, request, title, releaseSearch, {
      seasonId,
      target,
    });

    selectionResults.push({ target, releaseSearch, queuedDownload });
  }

  return { title, selections: selectionResults };
}
