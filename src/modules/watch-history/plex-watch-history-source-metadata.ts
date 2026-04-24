import { z } from "zod";

const plexWatchHistorySourceMetadataSchema = z.object({
  selectedUserId: z.string().trim().min(1),
  selectedUserName: z.string().trim().min(1),
  importLimit: z.number().int().min(1).max(500),
});

export type PlexWatchHistorySourceMetadata = z.infer<
  typeof plexWatchHistorySourceMetadataSchema
>;

export function parsePlexWatchHistorySourceMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  const parsed = plexWatchHistorySourceMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}