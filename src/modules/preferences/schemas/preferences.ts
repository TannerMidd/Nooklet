import { z } from "zod";

import { watchHistorySourceTypes } from "@/lib/database/schema";

export const preferenceMediaModeSchema = z.enum(["tv", "movies", "both"]);
export const watchHistorySourceTypeSchema = z.enum(watchHistorySourceTypes);

export const updatePreferencesInputSchema = z.object({
  defaultMediaMode: preferenceMediaModeSchema,
  defaultResultCount: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "Choose at least 1 result.")
    .max(50, "Keep the default result count at 50 or below."),
  defaultTemperature: z.coerce
    .number()
    .min(0, "Temperature must be at least 0.")
    .max(2, "Temperature must stay at 2 or below."),
  watchHistoryOnly: z.boolean(),
  watchHistorySourceTypes: z
    .array(watchHistorySourceTypeSchema)
    .min(1, "Select at least one watch-history source."),
  historyHideExisting: z.boolean(),
  historyHideLiked: z.boolean(),
  historyHideDisliked: z.boolean(),
  historyHideHidden: z.boolean(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
