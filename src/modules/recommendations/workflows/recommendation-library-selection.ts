import { type AddRecommendationToLibraryInput } from "../schemas/add-to-library";
import { type LibraryManagerMetadata } from "../../service-connections/library-manager-metadata";

type RecommendationLibrarySelectionInput = Pick<
  AddRecommendationToLibraryInput,
  "rootFolderPath" | "qualityProfileId" | "tagIds"
>;

export type RecommendationLibrarySelectionValidationResult =
  | { ok: true }
  | {
      ok: false;
      message: string;
      field?: "rootFolderPath" | "qualityProfileId" | "tagIds";
    };

export function validateRecommendationLibrarySelection(
  metadata: LibraryManagerMetadata | null,
  input: RecommendationLibrarySelectionInput,
  serviceDisplayName: string,
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

  return {
    ok: true,
  };
}