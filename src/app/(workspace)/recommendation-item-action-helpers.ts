import { z } from "zod";

import { type RecommendationLibraryActionState } from "./recommendation-action-state";
import { projectLibraryRequestFieldErrors } from "./library-request-action-helpers";
import {
  addRecommendationToLibrarySchema,
  type AddRecommendationToLibraryInput,
} from "../../modules/recommendations/schemas/add-to-library";

export const feedbackActionSchema = z.object({
  itemId: z.string().uuid(),
  feedback: z.enum(["like", "dislike"]),
  returnTo: z.string().min(1),
});

export const hiddenStateActionSchema = z.object({
  itemId: z.string().uuid(),
  isHidden: z.enum(["true", "false"]),
  returnTo: z.string().min(1),
});

export const recommendationLibraryDefaultsActionSchema = z.object({
  serviceType: z.enum(["sonarr", "radarr"]),
  rootFolderPath: z.string().trim().min(1),
  qualityProfileId: z.number().int().nonnegative(),
});

export function parseRecommendationLibraryActionFormData(formData: FormData) {
  return addRecommendationToLibrarySchema.safeParse({
    itemId: formData.get("itemId"),
    rootFolderPath: formData.get("rootFolderPath"),
    qualityProfileId: formData.get("qualityProfileId"),
    seasonSelectionMode: formData.get("seasonSelectionMode") ?? undefined,
    seasonNumbers: formData.getAll("seasonNumbers"),
    tagIds: formData.getAll("tagIds"),
    returnTo: formData.get("returnTo"),
  });
}

export function projectRecommendationLibraryFieldErrors(
  error: z.ZodError<AddRecommendationToLibraryInput>,
): RecommendationLibraryActionState["fieldErrors"] {
  return projectLibraryRequestFieldErrors(error);
}