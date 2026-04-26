import { z } from "zod";

import { watchHistorySourceUserSelectionSchema } from "@/modules/watch-history/schemas/watch-history-source-user-selection";

const plexWatchHistorySourceMetadataSchema = watchHistorySourceUserSelectionSchema;

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