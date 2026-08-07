import { z } from "zod";

export const defaultMissingSearchIntervalMinutes = 720;

export const missingSearchScheduleInputSchema = z.object({
    intervalMinutes: z.coerce
        .number()
        .int("Enter a whole number.")
        .min(15, "Schedule at least every 15 minutes.")
        .max(10_080, "Keep schedules within one week."),
    enabled: z.boolean(),
});

export type MissingSearchScheduleInput = z.infer<typeof missingSearchScheduleInputSchema>;
