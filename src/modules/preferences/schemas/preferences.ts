import { z } from "zod";

export const preferenceMediaModeSchema = z.enum(["tv", "movies", "both"]);

export const updatePreferencesInputSchema = z.object({
  defaultMediaMode: preferenceMediaModeSchema,
  defaultResultCount: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "Choose at least 1 result.")
    .max(50, "Keep the default result count at 50 or below."),
  watchHistoryOnly: z.boolean(),
  historyHideExisting: z.boolean(),
  historyHideLiked: z.boolean(),
  historyHideDisliked: z.boolean(),
  historyHideHidden: z.boolean(),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesInputSchema>;
