import { z } from "zod";

import { recommendationMediaTypes } from "@/lib/database/schema";

export const searchIndexersInputSchema = z.object({
  mediaType: z.enum(recommendationMediaTypes),
  query: z
    .string()
    .trim()
    .min(1, "Enter a search query.")
    .max(160, "Search query must be 160 characters or fewer."),
  tvdbId: z.number().int().positive().optional(),
  season: z.number().int().nonnegative().optional(),
  episode: z.number().int().positive().optional(),
});

export type SearchIndexersInput = z.infer<typeof searchIndexersInputSchema>;
export type ValidatedIndexerSearchRequest = z.infer<typeof searchIndexersInputSchema> & {
  normalizedKey: string;
};

export function normalizeIndexerSearchQuery(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function buildIndexerSearchKey(
  query: string,
  options: { season?: number; episode?: number },
) {
  const base = normalizeIndexerSearchQuery(query);
  const parts: string[] = [base];

  if (typeof options.season === "number") {
    parts.push(`s${options.season}`);
  }

  if (typeof options.episode === "number") {
    parts.push(`e${options.episode}`);
  }

  return parts.join(" ");
}

export function validateIndexerSearchRequest(input: SearchIndexersInput): ValidatedIndexerSearchRequest {
  const parsed = searchIndexersInputSchema.parse(input);

  return {
    ...parsed,
    normalizedKey: buildIndexerSearchKey(parsed.query, {
      season: parsed.season,
      episode: parsed.episode,
    }),
  };
}
