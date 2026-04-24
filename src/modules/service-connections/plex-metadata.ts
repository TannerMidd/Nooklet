import { z } from "zod";

const plexRemoteUserSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const plexMetadataSchema = z.object({
  serverName: z.union([z.string().trim().min(1), z.null()]).default(null),
  machineIdentifier: z.union([z.string().trim().min(1), z.null()]).default(null),
  version: z.union([z.string().trim().min(1), z.null()]).default(null),
  availableUsers: z.array(plexRemoteUserSchema).default([]),
});

export type PlexRemoteUser = z.infer<typeof plexRemoteUserSchema>;
export type PlexMetadata = z.infer<typeof plexMetadataSchema>;

export function parsePlexMetadata(metadata: Record<string, unknown> | null | undefined) {
  const parsed = plexMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}