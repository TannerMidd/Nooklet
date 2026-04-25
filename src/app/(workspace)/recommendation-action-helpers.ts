import { z } from "zod";

import { type RecommendationActionState } from "./recommendation-action-state";
import {
  recommendationRequestSchema,
  type RecommendationRequestInput,
} from "../../modules/recommendations/schemas/recommendation-request";

export const watchHistoryOnlyActionSchema = z.object({
  watchHistoryOnly: z.enum(["true", "false"]),
  redirectPath: z.string().min(1),
});

export const recommendationDefaultsActionSchema = z.object({
  requestedCount: z.number().int("Use a whole number.").min(1).max(20),
  temperature: z.number().min(0).max(2),
  aiModel: z
    .string()
    .trim()
    .min(1, "Choose or enter a model.")
    .max(200, "Keep the model identifier under 200 characters.")
    .optional(),
});

export function safeReturnTo(value: string) {
  return value.startsWith("/") ? value : "/history";
}

export function safeRevalidatePath(value: string) {
  const normalizedPath = safeReturnTo(value);
  const queryIndex = normalizedPath.indexOf("?");

  return queryIndex === -1 ? normalizedPath : normalizedPath.slice(0, queryIndex);
}

export function buildRecommendationRedirectPath(basePath: string, runId: string) {
  const searchParams = new URLSearchParams({
    run: runId,
    generated: "1",
  });

  return `${basePath}?${searchParams.toString()}`;
}

export function parseRecommendationRequestActionFormData(
  formData: FormData,
  fallbackRedirectPath = "/tv",
) {
  const redirectPath = safeReturnTo(
    formData.get("redirectPath")?.toString() ?? fallbackRedirectPath,
  );
  const parsedInput = recommendationRequestSchema.safeParse({
    mediaType: formData.get("mediaType"),
    requestPrompt: formData.get("requestPrompt"),
    requestedCount: formData.get("requestedCount"),
    aiModel: formData.get("aiModel"),
    temperature: formData.get("temperature"),
    selectedGenres: formData.getAll("selectedGenres"),
  });

  return {
    redirectPath,
    parsedInput,
  };
}

export function projectRecommendationRequestFieldErrors(
  error: z.ZodError<RecommendationRequestInput>,
): RecommendationActionState["fieldErrors"] {
  const flattenedErrors = error.flatten().fieldErrors;

  return {
    requestPrompt: flattenedErrors.requestPrompt?.[0],
    requestedCount: flattenedErrors.requestedCount?.[0],
    aiModel: flattenedErrors.aiModel?.[0],
    temperature: flattenedErrors.temperature?.[0],
    selectedGenres: flattenedErrors.selectedGenres?.[0],
  };
}