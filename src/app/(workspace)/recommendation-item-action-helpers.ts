import { z } from "zod";

import { type RecommendationLibraryActionState } from "./recommendation-action-state";
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

export function parseRecommendationLibraryActionFormData(formData: FormData) {
  return addRecommendationToLibrarySchema.safeParse({
    itemId: formData.get("itemId"),
    rootFolderPath: formData.get("rootFolderPath"),
    qualityProfileId: formData.get("qualityProfileId"),
    tagIds: formData.getAll("tagIds"),
    returnTo: formData.get("returnTo"),
  });
}

export function projectRecommendationLibraryFieldErrors(
  error: z.ZodError<AddRecommendationToLibraryInput>,
): RecommendationLibraryActionState["fieldErrors"] {
  const flattenedErrors = error.flatten().fieldErrors;

  return {
    rootFolderPath: flattenedErrors.rootFolderPath?.[0],
    qualityProfileId: flattenedErrors.qualityProfileId?.[0],
    tagIds: flattenedErrors.tagIds?.[0],
  };
}