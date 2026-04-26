import { z } from "zod";

export const finalizeRecommendationEpisodeSelectionSchema = z.object({
  itemId: z.string().uuid(),
  episodeIds: z
    .array(z.coerce.number().int().positive("Select valid episodes."))
    .min(1, "Select at least one episode to monitor."),
  returnTo: z.string().trim().min(1),
});

export type FinalizeRecommendationEpisodeSelectionInput = z.infer<
  typeof finalizeRecommendationEpisodeSelectionSchema
>;
