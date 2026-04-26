import { z } from "zod";

import { projectLibraryRequestFieldErrors } from "./library-request-action-helpers";
import { type RecommendationLibraryActionState } from "./recommendation-action-state";
import {
  addLibrarySearchRequestSchema,
  type AddLibrarySearchRequestInput,
} from "@/modules/service-connections/schemas/add-library-search-request";

export function parseLibrarySearchActionFormData(formData: FormData) {
  return addLibrarySearchRequestSchema.safeParse({
    serviceType: formData.get("serviceType"),
    title: formData.get("title"),
    year: formData.get("year"),
    availableSeasonNumbers: formData.getAll("availableSeasonNumbers"),
    rootFolderPath: formData.get("rootFolderPath"),
    qualityProfileId: formData.get("qualityProfileId"),
    seasonSelectionMode: formData.get("seasonSelectionMode") ?? undefined,
    seasonNumbers: formData.getAll("seasonNumbers"),
    tagIds: formData.getAll("tagIds"),
    returnTo: formData.get("returnTo"),
  });
}

export function projectLibrarySearchFieldErrors(
  error: z.ZodError<AddLibrarySearchRequestInput>,
): RecommendationLibraryActionState["fieldErrors"] {
  return projectLibraryRequestFieldErrors(error);
}