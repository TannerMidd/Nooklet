import { z } from "zod";

export const addRecommendationToLibrarySchema = z.object({
  itemId: z.string().uuid(),
  rootFolderPath: z.string().trim().min(1, "Select a root folder."),
  qualityProfileId: z.coerce.number().int().nonnegative("Select a quality profile."),
  tagIds: z.array(z.coerce.number().int().nonnegative()).default([]),
  returnTo: z.string().trim().min(1),
});

export type AddRecommendationToLibraryInput = z.infer<
  typeof addRecommendationToLibrarySchema
>;
