import { z } from "zod";

export const searchLibraryItemReleasesInputSchema = z
  .object({
    titleId: z.string().uuid("Choose a library title."),
    seasonId: z.string().uuid("Choose a season.").optional(),
    episodeId: z.string().uuid("Choose an episode.").optional(),
    targetLibraryPathId: z.string().uuid("Choose a library folder.").nullable().optional(),
    excludedResultIds: z.array(z.string().uuid()).default([]),
    excludedReleaseKeys: z.array(z.string().min(1)).default([]),
  })
  .refine((value) => !(value.seasonId && value.episodeId), {
    message: "Search either a season or an episode, not both.",
    path: ["seasonId"],
  });

export type SearchLibraryItemReleasesInput = z.input<typeof searchLibraryItemReleasesInputSchema>;
export type SearchLibraryItemReleasesRequest = z.output<typeof searchLibraryItemReleasesInputSchema>;

export function validateSearchLibraryItemReleasesRequest(input: unknown) {
  return searchLibraryItemReleasesInputSchema.parse(input);
}
