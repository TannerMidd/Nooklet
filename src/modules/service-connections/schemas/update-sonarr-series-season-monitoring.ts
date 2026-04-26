import { z } from "zod";

export const updateSonarrSeriesSeasonMonitoringSchema = z.object({
  seriesId: z.coerce.number().int().positive("Provide a valid Sonarr series id."),
  monitoredSeasonNumbers: z
    .array(z.coerce.number().int().min(0))
    .default([]),
  returnTo: z.string().trim().min(1),
});

export type UpdateSonarrSeriesSeasonMonitoringInput = z.infer<
  typeof updateSonarrSeriesSeasonMonitoringSchema
>;
