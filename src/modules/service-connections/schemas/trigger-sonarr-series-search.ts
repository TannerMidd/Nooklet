import { z } from "zod";

export const triggerSonarrSeriesSearchSchema = z.object({
  seriesId: z.coerce.number().int().positive("Provide a valid Sonarr series id."),
  returnTo: z.string().trim().min(1),
});

export type TriggerSonarrSeriesSearchInput = z.infer<
  typeof triggerSonarrSeriesSearchSchema
>;