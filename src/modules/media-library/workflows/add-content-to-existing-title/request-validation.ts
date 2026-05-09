import { z } from "zod";

import { mediaQualityProfiles } from "@/lib/database/schema";
import { tvSelectionsSchema } from "@/modules/media-library/schemas/request-media-title";

export const addContentToExistingTitleInputSchema = z.object({
  titleId: z.string().uuid(),
  selections: tvSelectionsSchema,
  downloadNow: z.boolean().default(true),
  qualityProfile: z.enum(mediaQualityProfiles).optional(),
  targetLibraryPathId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().uuid().nullable().optional(),
  ),
});

export type AddContentToExistingTitleInput = z.input<typeof addContentToExistingTitleInputSchema>;
export type AddContentToExistingTitleParsedInput = z.infer<typeof addContentToExistingTitleInputSchema>;

export function validateAddContentToExistingTitleRequest(input: unknown) {
  return addContentToExistingTitleInputSchema.parse(input);
}
