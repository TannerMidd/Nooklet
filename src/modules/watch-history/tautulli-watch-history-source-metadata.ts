import { z } from "zod";

import { watchHistorySourceUserSelectionSchema } from "@/modules/watch-history/schemas/watch-history-source-user-selection";

const tautulliWatchHistorySourceMetadataSchema = watchHistorySourceUserSelectionSchema;

export type TautulliWatchHistorySourceMetadata = z.infer<
  typeof tautulliWatchHistorySourceMetadataSchema
>;

export function parseTautulliWatchHistorySourceMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  const parsed = tautulliWatchHistorySourceMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}