import { z } from "zod";

const booleanFromString = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((value) => value === true || value === "true");

export const deleteSonarrSeriesBulkSchema = z.object({
  seriesIds: z
    .array(z.coerce.number().int().positive("Provide valid Sonarr series ids."))
    .min(1, "Select at least one Sonarr series.")
    .transform((seriesIds) => Array.from(new Set(seriesIds))),
  deleteFiles: booleanFromString.default(false),
  returnTo: z.string().trim().min(1),
});

export type DeleteSonarrSeriesBulkInput = z.infer<typeof deleteSonarrSeriesBulkSchema>;