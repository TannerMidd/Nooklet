import { z } from "zod";

export const traktWatchHistorySyncInputSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  importLimit: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(1, "Import at least one title.")
    .max(500, "Keep Trakt imports to 500 titles or fewer."),
});

export type TraktWatchHistorySyncInput = z.infer<typeof traktWatchHistorySyncInputSchema>;