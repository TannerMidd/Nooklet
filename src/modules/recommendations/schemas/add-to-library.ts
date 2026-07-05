import { z } from "zod";

import { mediaQualityProfiles } from "@/lib/database/schema";
import { tvSelectionsSchema } from "@/modules/media-library/schemas/request-media-title";

const optionalUuidField = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().uuid().nullable().optional(),
);

const booleanField = z.preprocess((value) => {
  if (typeof value === "string") {
    if (value === "true" || value === "on" || value === "1") {
      return true;
    }

    if (value === "false" || value === "off" || value === "0") {
      return false;
    }
  }

  return value;
}, z.boolean().default(true));

export const addRecommendationToLibrarySchema = z.object({
  itemId: z.string().uuid(),
  libraryId: optionalUuidField,
  targetLibraryPathId: optionalUuidField,
  monitored: booleanField,
  qualityProfile: z.enum(mediaQualityProfiles).default("hd-1080p"),
  downloadNow: booleanField,
  selections: tvSelectionsSchema,
  returnTo: z.string().min(1),
});

export type AddRecommendationToLibraryInput = z.infer<
  typeof addRecommendationToLibrarySchema
>;
