import { z } from "zod";

export const triggerRadarrMovieSearchSchema = z.object({
  movieId: z.coerce.number().int().positive("Provide a valid Radarr movie id."),
  returnTo: z.string().trim().min(1),
});

export type TriggerRadarrMovieSearchInput = z.infer<
  typeof triggerRadarrMovieSearchSchema
>;