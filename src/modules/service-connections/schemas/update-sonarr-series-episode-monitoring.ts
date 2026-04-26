import { z } from "zod";

export const updateSonarrSeriesEpisodeMonitoringSchema = z.object({
  seriesId: z.coerce.number().int().positive(),
  episodeIds: z
    .array(z.coerce.number().int().positive())
    .default([]),
  returnTo: z.string().min(1),
});

export type UpdateSonarrSeriesEpisodeMonitoringInput = z.infer<
  typeof updateSonarrSeriesEpisodeMonitoringSchema
>;
