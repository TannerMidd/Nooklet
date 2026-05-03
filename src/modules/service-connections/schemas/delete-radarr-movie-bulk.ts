import { z } from "zod";

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const deleteRadarrMovieBulkSchema = z.object({
  movieIds: z
    .array(z.coerce.number().int().positive("Provide valid Radarr movie ids."))
    .min(1, "Select at least one Radarr movie.")
    .transform((movieIds) => Array.from(new Set(movieIds))),
  deleteFiles: booleanFromString.default(false),
  returnTo: z.string().trim().min(1),
});

export type DeleteRadarrMovieBulkInput = z.infer<typeof deleteRadarrMovieBulkSchema>;