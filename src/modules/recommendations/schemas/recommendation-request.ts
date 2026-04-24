import { z } from "zod";

export const recommendationRequestSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  requestPrompt: z
    .string()
    .trim()
    .min(8, "Describe what kind of recommendations you want.")
    .max(500, "Keep the request under 500 characters."),
  requestedCount: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "Request at least 1 recommendation.")
    .max(20, "Keep the request at 20 recommendations or fewer."),
});

export type RecommendationRequestInput = z.infer<typeof recommendationRequestSchema>;
