import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type AddRecommendationToLibraryInput } from "@/modules/recommendations/schemas/add-to-library";
import {
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { requestLibraryItem } from "@/modules/service-connections/workflows/request-library-item";

type AddRecommendationToLibraryResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      field?: "rootFolderPath" | "qualityProfileId" | "seasonNumbers" | "tagIds";
    };

export async function addRecommendationToLibrary(
  userId: string,
  input: AddRecommendationToLibraryInput,
): Promise<AddRecommendationToLibraryResult> {
  const item = await findRecommendationItemForUser(userId, input.itemId);

  if (!item) {
    return {
      ok: false,
      message: "Recommendation item not found.",
    };
  }

  if (item.existingInLibrary) {
    return {
      ok: false,
      message: "This recommendation is already marked as existing in the library.",
    };
  }

  const itemProviderMetadata = parseRecommendationProviderMetadata(item.providerMetadataJson);
  const availableSeasonNumbers = itemProviderMetadata?.availableSeasons?.map(
    (season) => season.seasonNumber,
  );

  const serviceType = item.mediaType === "tv" ? "sonarr" : "radarr";
  const definition = getServiceConnectionDefinition(serviceType);
  const result = await requestLibraryItem(userId, {
    serviceType,
    title: item.title,
    year: item.year,
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    seasonSelectionMode: input.seasonSelectionMode,
    seasonNumbers: input.seasonNumbers,
    tagIds: input.tagIds,
  }, {
    availableSeasonNumbers,
    subjectType: "recommendation-item",
    subjectId: item.itemId,
    eventTypePrefix: "recommendations.item.library-add",
    configureMessage: `Configure ${definition.displayName} before adding recommended titles.`,
    verifyMessage: `Verify ${definition.displayName} before adding recommended titles.`,
    auditPayload: {
      recommendationItemId: item.itemId,
    },
  });

  if (!result.ok) {
    return result;
  }

  await markRecommendationItemExistingInLibrary(item.itemId, true);

  return result;
}
