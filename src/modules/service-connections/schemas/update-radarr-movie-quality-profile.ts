import { z } from "zod";

export const updateRadarrMovieQualityProfileSchema = z.object({
  movieId: z.coerce.number().int().positive("Provide a valid Radarr movie id."),
  qualityProfileId: z.coerce.number().int().nonnegative("Select a quality profile."),
  returnTo: z.string().trim().min(1),
});

export type UpdateRadarrMovieQualityProfileInput = z.infer<
  typeof updateRadarrMovieQualityProfileSchema
>;