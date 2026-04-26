import { z } from "zod";

export const libraryRequestSelectionFields = {
  rootFolderPath: z.string().trim().min(1, "Select a root folder."),
  qualityProfileId: z.coerce.number().int().nonnegative("Select a quality profile."),
  seasonSelectionMode: z.enum(["all", "custom"]).default("all"),
  seasonNumbers: z.array(z.coerce.number().int().nonnegative("Select valid seasons.")).default([]),
  tagIds: z.array(z.coerce.number().int().nonnegative()).default([]),
  returnTo: z.string().trim().min(1),
};

export const libraryRequestSelectionSchema = z.object(libraryRequestSelectionFields);

export type LibraryRequestSelectionInput = z.infer<typeof libraryRequestSelectionSchema>;