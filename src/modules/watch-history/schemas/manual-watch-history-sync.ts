import { z } from "zod";

export const manualWatchHistorySyncInputSchema = z.object({
  mediaType: z.enum(["tv", "movie"]),
  entriesText: z
    .string()
    .trim()
    .min(1, "Paste at least one watched title.")
    .max(20000, "Keep the watch-history import under 20,000 characters."),
});

export type ManualWatchHistorySyncInput = z.infer<typeof manualWatchHistorySyncInputSchema>;
