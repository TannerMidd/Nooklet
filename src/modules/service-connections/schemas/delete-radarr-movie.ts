import { z } from "zod";

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const deleteRadarrMovieSchema = z.object({
  movieId: z.coerce.number().int().positive("Provide a valid Radarr movie id."),
  deleteFiles: booleanFromString.default(false),
  returnTo: z.string().trim().min(1),
});

export type DeleteRadarrMovieInput = z.infer<typeof deleteRadarrMovieSchema>;
