import { z } from "zod";

import { mediaQualityProfiles, recommendationMediaTypes } from "@/lib/database/schema";

export const updateMediaTitlePreferencesInputSchema = z.object({
    titleId: z.string().uuid("Select a title and try again."),
    monitored: z.boolean(),
    qualityProfile: z.enum(mediaQualityProfiles),
});

export type UpdateMediaTitlePreferencesInput = z.infer<
    typeof updateMediaTitlePreferencesInputSchema
>;

export const updateMediaLibraryMonitoringInputSchema = z.object({
    mediaType: z.enum([...recommendationMediaTypes, "all"]).default("all"),
    monitored: z.boolean(),
});

export type UpdateMediaLibraryMonitoringInput = z.infer<
    typeof updateMediaLibraryMonitoringInputSchema
>;
