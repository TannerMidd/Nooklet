import { z } from "zod";

import { libraryRequestSelectionFields } from "@/modules/service-connections/schemas/library-request-selection";

export const addRecommendationToLibrarySchema = z.object({
  itemId: z.string().uuid(),
  ...libraryRequestSelectionFields,
});

export type AddRecommendationToLibraryInput = z.infer<
  typeof addRecommendationToLibrarySchema
>;
