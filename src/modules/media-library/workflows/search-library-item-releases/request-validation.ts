import { z } from "zod";

export const searchLibraryItemReleasesInputSchema = z.object({
  titleId: z.string().uuid("Choose a library title."),
  episodeId: z.string().uuid("Choose an episode.").optional(),
  targetLibraryPathId: z.string().uuid("Choose a library folder.").nullable().optional(),
  excludedResultIds: z.array(z.string().uuid()).default([]),
});

export type SearchLibraryItemReleasesInput = z.input<typeof searchLibraryItemReleasesInputSchema>;
export type SearchLibraryItemReleasesRequest = z.output<typeof searchLibraryItemReleasesInputSchema>;

export function validateSearchLibraryItemReleasesRequest(input: unknown) {
  return searchLibraryItemReleasesInputSchema.parse(input);
}
