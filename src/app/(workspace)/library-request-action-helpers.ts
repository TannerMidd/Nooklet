import { z } from "zod";

import { type RecommendationLibraryActionState } from "./recommendation-action-state";

type LibraryRequestFieldErrors = {
  rootFolderPath?: string;
  qualityProfileId?: number;
  seasonNumbers?: number[];
  tagIds?: number[];
};

export function projectLibraryRequestFieldErrors(
  error: z.ZodError<LibraryRequestFieldErrors>,
): RecommendationLibraryActionState["fieldErrors"] {
  const flattenedErrors = error.flatten().fieldErrors;

  return {
    rootFolderPath: flattenedErrors.rootFolderPath?.[0],
    qualityProfileId: flattenedErrors.qualityProfileId?.[0],
    seasonNumbers: flattenedErrors.seasonNumbers?.[0],
    tagIds: flattenedErrors.tagIds?.[0],
  };
}