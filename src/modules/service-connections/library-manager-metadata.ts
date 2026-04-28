import { z } from "zod";

const optionalByteCountSchema = z.preprocess(
  (value) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.trunc(value)
      : undefined,
  z.number().int().nonnegative().optional(),
);

const libraryManagerRootFolderSchema = z.object({
  path: z.string().trim().min(1),
  label: z.string().trim().min(1),
  freeSpaceBytes: optionalByteCountSchema,
  totalSpaceBytes: optionalByteCountSchema,
});

const libraryManagerQualityProfileSchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().trim().min(1),
});

const libraryManagerTagSchema = z.object({
  id: z.number().int().nonnegative(),
  label: z.string().trim().min(1),
});

export const libraryManagerMetadataSchema = z.object({
  rootFolders: z.array(libraryManagerRootFolderSchema),
  qualityProfiles: z.array(libraryManagerQualityProfileSchema),
  tags: z.array(libraryManagerTagSchema),
});

export type LibraryManagerRootFolder = z.infer<typeof libraryManagerRootFolderSchema>;
export type LibraryManagerQualityProfile = z.infer<
  typeof libraryManagerQualityProfileSchema
>;
export type LibraryManagerTag = z.infer<typeof libraryManagerTagSchema>;
export type LibraryManagerMetadata = z.infer<typeof libraryManagerMetadataSchema>;

export function parseLibraryManagerMetadata(metadata: Record<string, unknown> | null | undefined) {
  const parsed = libraryManagerMetadataSchema.safeParse(metadata);

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}
