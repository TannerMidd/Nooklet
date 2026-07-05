import { z } from "zod";

import { mediaQualityProfiles } from "@/lib/database/schema";
import {
  findMediaTitleByIdForUser,
  findMediaTitleTmdbId,
  type MediaTitleRecord,
} from "@/modules/media-library/repositories/media-library-repository";
import { tvSelectionsSchema } from "@/modules/media-library/schemas/request-media-title";

import { type RequestTitleWithReleaseSearchInput } from "./request-validation";

export const requestExistingTitleContentInputSchema = z.object({
  titleId: z.string().uuid(),
  selections: tvSelectionsSchema,
  downloadNow: z.boolean().default(true),
  qualityProfile: z.enum(mediaQualityProfiles).optional(),
  targetLibraryPathId: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().uuid().nullable().optional(),
  ),
});

export type RequestExistingTitleContentInput = z.input<typeof requestExistingTitleContentInputSchema>;
export type RequestExistingTitleContentParsedInput = z.infer<typeof requestExistingTitleContentInputSchema>;

export function validateRequestExistingTitleContentRequest(input: unknown) {
  return requestExistingTitleContentInputSchema.parse(input);
}

export class RequestExistingTitleContentWorkflowError extends Error {
  constructor(
    message: string,
    public readonly code: "title_not_found" | "not_tv_title" | "no_selections",
  ) {
    super(message);
    this.name = "RequestExistingTitleContentWorkflowError";
  }
}

export type LoadedExistingTitleContext = {
  title: MediaTitleRecord;
  request: RequestTitleWithReleaseSearchInput;
};

/**
 * Resolves an existing library title into a full request input, including the
 * linked TMDB id so selection persistence can sync the episode structure.
 */
export async function loadExistingTitleRequest(
  userId: string,
  input: RequestExistingTitleContentParsedInput,
): Promise<LoadedExistingTitleContext> {
  if (!input.selections) {
    throw new RequestExistingTitleContentWorkflowError(
      "Pick at least one season or episode to add.",
      "no_selections",
    );
  }

  const title = await findMediaTitleByIdForUser(userId, input.titleId);

  if (!title) {
    throw new RequestExistingTitleContentWorkflowError("Title was not found.", "title_not_found");
  }

  if (title.mediaType !== "tv") {
    throw new RequestExistingTitleContentWorkflowError(
      "This title is not a TV series.",
      "not_tv_title",
    );
  }

  const tmdbId = await findMediaTitleTmdbId(title.id);

  const request: RequestTitleWithReleaseSearchInput = {
    mediaType: "tv",
    libraryId: title.libraryId,
    targetLibraryPathId: input.targetLibraryPathId ?? null,
    tmdbId: tmdbId ?? undefined,
    title: title.title,
    year: title.year,
    monitored: title.monitored,
    qualityProfile: input.qualityProfile ?? title.qualityProfile,
    overview: title.overview,
    posterUrl: title.posterUrl,
    backdropUrl: title.backdropUrl,
    runtimeMinutes: title.runtimeMinutes,
    originalLanguage: title.originalLanguage,
    selections: input.selections,
    downloadNow: input.downloadNow,
  };

  return { title, request };
}
