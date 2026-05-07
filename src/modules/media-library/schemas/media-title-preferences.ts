import { z } from "zod";

import { mediaQualityProfiles } from "@/lib/database/schema";

export const updateMediaTitlePreferencesInputSchema = z.object({
  titleId: z.string().uuid("Select a title and try again."),
  monitored: z.boolean(),
  qualityProfile: z.enum(mediaQualityProfiles),
});

export type UpdateMediaTitlePreferencesInput = z.infer<typeof updateMediaTitlePreferencesInputSchema>;
