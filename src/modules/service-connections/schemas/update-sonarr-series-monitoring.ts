import { z } from "zod";

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const updateSonarrSeriesMonitoringSchema = z.object({
  seriesId: z.coerce.number().int().positive("Provide a valid Sonarr series id."),
  monitored: booleanFromString,
  applyToAllSeasons: booleanFromString.default(false),
  returnTo: z.string().trim().min(1),
});

export type UpdateSonarrSeriesMonitoringInput = z.infer<
  typeof updateSonarrSeriesMonitoringSchema
>;
