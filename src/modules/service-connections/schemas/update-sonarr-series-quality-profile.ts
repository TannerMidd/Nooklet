import { z } from "zod";

export const updateSonarrSeriesQualityProfileSchema = z.object({
  seriesId: z.coerce.number().int().positive("Provide a valid Sonarr series id."),
  qualityProfileId: z.coerce.number().int().nonnegative("Select a quality profile."),
  returnTo: z.string().trim().min(1),
});

export type UpdateSonarrSeriesQualityProfileInput = z.infer<
  typeof updateSonarrSeriesQualityProfileSchema
>;