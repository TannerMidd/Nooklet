import { z } from "zod";

const tautulliWatchHistorySourceMetadataSchema = z.object({
  selectedUserId: z.string().trim().min(1),
  selectedUserName: z.string().trim().min(1),
  importLimit: z.number().int().min(1).max(500),
});

export type TautulliWatchHistorySourceMetadata = z.infer<
  typeof tautulliWatchHistorySourceMetadataSchema
>;

export function parseWatchHistorySourceMetadataJson(metadataJson: string | null | undefined) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function parseTautulliWatchHistorySourceMetadata(
  metadata: Record<string, unknown> | null | undefined,
) {
  const parsed = tautulliWatchHistorySourceMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}