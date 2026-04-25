import { z } from "zod";

import {
  normalizeRecommendationGenres,
  recommendationGenreValues,
} from "@/modules/recommendations/recommendation-genres";

const recommendationGenreSchema = z.enum(recommendationGenreValues);

export const recommendationRequestSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  requestPrompt: z.preprocess(
    (value) => (typeof value === "string" ? value : ""),
    z.string().trim().max(500, "Keep the request under 500 characters."),
  ),
  requestedCount: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "Request at least 1 recommendation.")
    .max(20, "Keep the request at 20 recommendations or fewer."),
  aiModel: z
    .string()
    .trim()
    .min(1, "Choose or enter a model.")
    .max(200, "Keep the model identifier under 200 characters."),
  temperature: z.coerce
    .number()
    .min(0, "Temperature must be 0 or higher.")
    .max(2, "Temperature must be 2 or lower."),
  selectedGenres: z.preprocess(
    (value) => {
      if (Array.isArray(value)) {
        return value;
      }

      if (typeof value === "string" && value.trim().length > 0) {
        return [value];
      }

      return [];
    },
    z.array(recommendationGenreSchema),
  ).transform((value) => normalizeRecommendationGenres(value)),
});

export type RecommendationRequestInput = z.infer<typeof recommendationRequestSchema>;
