import { z } from "zod";

export const sabnzbdMetadataSchema = z.object({
  version: z.union([z.string().trim().min(1), z.null()]).default(null),
  queueStatus: z.union([z.string().trim().min(1), z.null()]).default(null),
  queuePaused: z.boolean().default(false),
  activeQueueCount: z.number().int().nonnegative().default(0),
  speed: z.union([z.string().trim().min(1), z.null()]).default(null),
  timeLeft: z.union([z.string().trim().min(1), z.null()]).default(null),
});

export type SabnzbdMetadata = z.infer<typeof sabnzbdMetadataSchema>;

export function parseSabnzbdMetadata(metadata: Record<string, unknown> | null | undefined) {
  const parsed = sabnzbdMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}