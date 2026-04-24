import { z } from "zod";

export const plexWatchHistorySyncInputSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  plexUserId: z.string().trim().min(1, "Select a Plex user."),
  importLimit: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(1, "Import at least one title.")
    .max(500, "Keep Plex imports to 500 titles or fewer."),
});

export type PlexWatchHistorySyncInput = z.infer<typeof plexWatchHistorySyncInputSchema>;