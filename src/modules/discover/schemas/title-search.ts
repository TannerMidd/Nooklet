import { z } from "zod";

import { recommendationMediaTypes } from "@/lib/database/schema";

export const searchDiscoverTitlesInputSchema = z.object({
  mediaType: z.enum(recommendationMediaTypes),
  query: z.string().trim().min(2, "Enter at least 2 characters.").max(120),
});

export type SearchDiscoverTitlesInput = z.infer<typeof searchDiscoverTitlesInputSchema>;
