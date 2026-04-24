import { z } from "zod";

import { parseWatchHistorySourceMetadataJson } from "@/modules/watch-history/source-metadata";

const tautulliWatchHistorySourceMetadataSchema = z.object({
  selectedUserId: z.string().trim().min(1),
  selectedUserName: z.string().trim().min(1),
  importLimit: z.number().int().min(1).max(500),
});

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