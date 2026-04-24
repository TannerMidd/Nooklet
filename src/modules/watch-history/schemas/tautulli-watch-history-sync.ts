import { z } from "zod";

export const tautulliWatchHistorySyncInputSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  tautulliUserId: z.string().trim().min(1, "Select a Plex user."),
  importLimit: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(1, "Import at least one title.")
    .max(500, "Keep Tautulli imports to 500 titles or fewer."),
});

export type TautulliWatchHistorySyncInput = z.infer<typeof tautulliWatchHistorySyncInputSchema>;