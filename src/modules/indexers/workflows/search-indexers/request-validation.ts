import { z } from "zod";

import { recommendationMediaTypes } from "@/lib/database/schema";

export const searchIndexersInputSchema = z.object({
  mediaType: z.enum(recommendationMediaTypes),
  query: z
    .string()
    .trim()
    .min(1, "Enter a search query.")
    .max(160, "Search query must be 160 characters or fewer."),
});

export type SearchIndexersInput = z.infer<typeof searchIndexersInputSchema>;
export type ValidatedIndexerSearchRequest = z.infer<typeof searchIndexersInputSchema> & {
  normalizedKey: string;
};

export function normalizeIndexerSearchQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function validateIndexerSearchRequest(input: SearchIndexersInput): ValidatedIndexerSearchRequest {
  const parsed = searchIndexersInputSchema.parse(input);

  return {
    ...parsed,
    normalizedKey: normalizeIndexerSearchQuery(parsed.query),
  };
}
