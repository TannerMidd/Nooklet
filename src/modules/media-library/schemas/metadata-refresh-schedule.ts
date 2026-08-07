import { z } from "zod";

export const defaultMetadataRefreshIntervalMinutes = 720;

export const metadataRefreshScheduleInputSchema = z.object({
    intervalMinutes: z.coerce
        .number()
        .int("Enter a whole number.")
        .min(15, "Schedule at least every 15 minutes.")
        .max(10_080, "Keep schedules within one week."),
    enabled: z.boolean(),
});

export type MetadataRefreshScheduleInput = z.infer<typeof metadataRefreshScheduleInputSchema>;
