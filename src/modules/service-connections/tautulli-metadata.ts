import { z } from "zod";

const tautulliRemoteUserSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
});

export const tautulliMetadataSchema = z.object({
  serverName: z.union([z.string().trim().min(1), z.null()]).default(null),
  availableUsers: z.array(tautulliRemoteUserSchema).default([]),
});

export type TautulliRemoteUser = z.infer<typeof tautulliRemoteUserSchema>;
export type TautulliMetadata = z.infer<typeof tautulliMetadataSchema>;

export function parseTautulliMetadata(metadata: Record<string, unknown> | null | undefined) {
  const parsed = tautulliMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}