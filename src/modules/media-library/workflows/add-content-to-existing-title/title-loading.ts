import {
  findMediaTitleByIdForUser,
  type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";

import { type RequestTitleWithReleaseSearchInput } from "../request-title-with-release-search/request-validation";
import { type AddContentToExistingTitleParsedInput } from "./request-validation";

export class AddContentToExistingTitleWorkflowError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "title_not_found"
      | "not_tv_title"
      | "no_selections",
  ) {
    super(message);
    this.name = "AddContentToExistingTitleWorkflowError";
  }
}

export type LoadedExistingTitleContext = {
  title: MediaTitleRecord;
  request: RequestTitleWithReleaseSearchInput;
};

export async function loadExistingTitleForAddContent(
  userId: string,
  input: AddContentToExistingTitleParsedInput,
): Promise<LoadedExistingTitleContext> {
  if (!input.selections) {
    throw new AddContentToExistingTitleWorkflowError(
      "Pick at least one season or episode to add.",
      "no_selections",
    );
  }

  const title = await findMediaTitleByIdForUser(userId, input.titleId);

  if (!title) {
    throw new AddContentToExistingTitleWorkflowError("Title was not found.", "title_not_found");
  }

  if (title.mediaType !== "tv") {
    throw new AddContentToExistingTitleWorkflowError(
      "This title is not a TV series.",
      "not_tv_title",
    );
  }

  const request: RequestTitleWithReleaseSearchInput = {
    mediaType: "tv",
    libraryId: title.libraryId,
    targetLibraryPathId: input.targetLibraryPathId ?? null,
    title: title.title,
    year: title.year,
    monitored: title.monitored,
    qualityProfile: input.qualityProfile ?? title.qualityProfile,
    overview: title.overview,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    runtimeMinutes: title.runtimeMinutes,
    originalLanguage: title.originalLanguage,
    selections: input.selections,
    downloadNow: input.downloadNow,
  };

  return { title, request };
}
