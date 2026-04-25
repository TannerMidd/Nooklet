import { type RecommendationMediaType } from "@/lib/database/schema";

import { type AddRecommendationToLibraryInput } from "../schemas/add-to-library";
import { type LibraryManagerMetadata } from "../../service-connections/library-manager-metadata";

type RecommendationLibrarySelectionInput = Pick<
  AddRecommendationToLibraryInput,
  "rootFolderPath" | "qualityProfileId" | "tagIds"
> & {
  seasonSelectionMode?: AddRecommendationToLibraryInput["seasonSelectionMode"];
  seasonNumbers?: AddRecommendationToLibraryInput["seasonNumbers"];
};

type RecommendationLibrarySelectionValidationOptions = {
  mediaType?: RecommendationMediaType;
  availableSeasonNumbers?: number[] | null;
};

export type RecommendationLibrarySelectionValidationResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      field?: "rootFolderPath" | "qualityProfileId" | "seasonNumbers" | "tagIds";
    };

export function validateRecommendationLibrarySelection(
  metadata: LibraryManagerMetadata | null,
  input: RecommendationLibrarySelectionInput,
  serviceDisplayName: string,
  options: RecommendationLibrarySelectionValidationOptions = {},
): RecommendationLibrarySelectionValidationResult {
  if (!metadata || metadata.rootFolders.length === 0 || metadata.qualityProfiles.length === 0) {
    return {
      ok: false,
      message: `Re-run ${serviceDisplayName} verification to load root folders and quality profiles.`,
    };
  }

  if (!metadata.rootFolders.some((entry) => entry.path === input.rootFolderPath)) {
    return {
      ok: false,
      message: "Select a valid root folder.",
      field: "rootFolderPath",
    };
  }

  if (!metadata.qualityProfiles.some((entry) => entry.id === input.qualityProfileId)) {
    return {
      ok: false,
      message: "Select a valid quality profile.",
      field: "qualityProfileId",
    };
  }

  const availableTagIds = new Set(metadata.tags.map((entry) => entry.id));

  if (input.tagIds.some((tagId) => !availableTagIds.has(tagId))) {
    return {
      ok: false,
      message: "Select only tags returned by the verified library manager connection.",
      field: "tagIds",
    };
  }

  const mediaType = options.mediaType ?? "movie";
  const seasonSelectionMode = input.seasonSelectionMode ?? "all";
  const seasonNumbers = input.seasonNumbers ?? [];
  const availableSeasonNumbers = Array.from(
    new Set(
      (options.availableSeasonNumbers ?? []).filter(
        (seasonNumber): seasonNumber is number =>
          Number.isInteger(seasonNumber) && seasonNumber >= 0,
      ),
    ),
  );

  if (mediaType === "tv" && seasonSelectionMode === "custom") {
    if (availableSeasonNumbers.length === 0) {
      return {
        ok: false,
        message: "Season choices are unavailable for this show right now. Choose all seasons instead.",
        field: "seasonNumbers",
      };
    }

    if (seasonNumbers.length === 0) {
      return {
        ok: false,
        message: "Select at least one season or choose all seasons.",
        field: "seasonNumbers",
      };
    }

    const availableSeasonNumberSet = new Set(availableSeasonNumbers);

    if (seasonNumbers.some((seasonNumber) => !availableSeasonNumberSet.has(seasonNumber))) {
      return {
        ok: false,
        message: "Select only seasons returned for this show.",
        field: "seasonNumbers",
      };
    }
  }

  return {
    ok: true,
  };
}