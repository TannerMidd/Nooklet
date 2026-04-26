import { z } from "zod";

/**
 * Shared Zod schema for watch-history sources that select a remote user
 * (Plex direct, Tautulli) and cap the per-sync import volume. Source-specific
 * metadata files alias this schema so they can extend it later without
 * duplicating the common fields.
 */
export const watchHistorySourceUserSelectionSchema = z.object({
  selectedUserId: z.string().trim().min(1),
  selectedUserName: z.string().trim().min(1),
  importLimit: z.number().int().min(1).max(500),
});

export type WatchHistorySourceUserSelectionMetadata = z.infer<
  typeof watchHistorySourceUserSelectionSchema
>;
