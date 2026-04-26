import { z } from "zod";

export const traktWatchHistorySourceMetadataSchema = z.object({
  importLimit: z.number().int().min(1).max(500),
  username: z.string().nullable().optional(),
  displayName: z.string().nullable().optional(),
});

export function parseTraktWatchHistorySourceMetadata(value: unknown) {
  const parsed = traktWatchHistorySourceMetadataSchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}