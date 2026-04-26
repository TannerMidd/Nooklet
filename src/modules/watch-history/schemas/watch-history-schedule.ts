import { z } from "zod";

export const schedulableWatchHistorySourceTypeSchema = z.enum(["plex", "tautulli", "trakt"]);

export const watchHistoryScheduleInputSchema = z.object({
  sourceType: schedulableWatchHistorySourceTypeSchema,
  intervalHours: z.coerce
    .number()
    .int("Enter a whole number.")
    .min(1, "Schedule at least hourly.")
    .max(168, "Keep schedules within one week."),
  enabled: z.boolean(),
});

export type WatchHistoryScheduleInput = z.infer<typeof watchHistoryScheduleInputSchema>;