import { z } from "zod";

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const updateRadarrMovieMonitoringSchema = z.object({
  movieId: z.coerce.number().int().positive("Provide a valid Radarr movie id."),
  monitored: booleanFromString,
  returnTo: z.string().trim().min(1),
});

export type UpdateRadarrMovieMonitoringInput = z.infer<
  typeof updateRadarrMovieMonitoringSchema
>;
