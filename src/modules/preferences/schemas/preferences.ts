import { z } from "zod";

import { watchHistorySourceTypes } from "@/lib/database/schema";
import { languagePreferenceCodes } from "@/modules/preferences/language-preferences";
import {
  maximumLibraryTasteSampleSize,
  minimumLibraryTasteSampleSize,
} from "@/modules/recommendations/library-taste-sample-size";

export const preferenceMediaModeSchema = z.enum(["tv", "movies", "both"]);
export const languagePreferenceSchema = z.enum(languagePreferenceCodes);
export const watchHistorySourceTypeSchema = z.enum(watchHistorySourceTypes);

export const updatePreferencesInputSchema = z.object({
  defaultMediaMode: preferenceMediaModeSchema,
  defaultResultCount: z.coerce
    .number()
    .int("Use a whole number.")
    .min(1, "Choose at least 1 result.")
    .max(50, "Keep the default result count at 50 or below."),
  libraryTasteSampleSize: z.coerce
    .number()
    .int("Use a whole number.")
    .min(
      minimumLibraryTasteSampleSize,
      `Use at least ${minimumLibraryTasteSampleSize} titles for the library sample.`,
    )
    .max(
      maximumLibraryTasteSampleSize,
      `Keep the library sample at ${maximumLibraryTasteSampleSize} titles or fewer.`,
    ),
  defaultTemperature: z.coerce
    .number()
    .min(0, "Temperature must be at least 0.")
    .max(2, "Temperature must stay at 2 or below."),
  languagePreference: languagePreferenceSchema,
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
