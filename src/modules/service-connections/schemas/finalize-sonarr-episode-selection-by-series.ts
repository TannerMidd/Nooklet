import { z } from "zod";

export const finalizeSonarrEpisodeSelectionBySeriesSchema = z.object({
  seriesId: z.coerce.number().int().positive("Provide a valid Sonarr series id."),
  episodeIds: z
    .array(z.coerce.number().int().positive("Select valid episodes."))
    .min(1, "Select at least one episode to monitor."),
  returnTo: z.string().trim().min(1),
});

export type FinalizeSonarrEpisodeSelectionBySeriesInput = z.infer<
  typeof finalizeSonarrEpisodeSelectionBySeriesSchema
>;
