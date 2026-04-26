import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type AddRecommendationToLibraryInput } from "@/modules/recommendations/schemas/add-to-library";
import {
  createRecommendationItemTimelineEvent,
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
  updateRecommendationItemProviderMetadata,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { requestLibraryItem } from "@/modules/service-connections/workflows/request-library-item";

type AddRecommendationToLibraryResult =
  | {
      ok: true;
      message: string;
      pendingEpisodeSelection?: {
        sonarrSeriesId: number;
        seriesTitle: string;
        recommendationItemId: string;
      };
    }
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
    await createRecommendationItemTimelineEvent({
      userId,
      itemId: item.itemId,
      eventType: "library-add",
      status: "failed",
      title: `Add to ${definition.displayName} failed`,
      message: result.message,
      metadata: {
        serviceType,
        field: result.field,
      },
    });

    return result;
  }

  const isEpisodeFlow =
    serviceType === "sonarr" &&
    input.seasonSelectionMode === "episode" &&
    typeof result.sonarrSeriesId === "number";

  if (isEpisodeFlow) {
    const nextMetadata = {
      ...(itemProviderMetadata ?? {}),
      sonarrSeriesId: result.sonarrSeriesId,
      pendingEpisodeSelection: true,
      pendingEpisodeReturnTo: input.returnTo,
    };

    await updateRecommendationItemProviderMetadata(
      item.itemId,
      JSON.stringify(nextMetadata),
    );
    await createRecommendationItemTimelineEvent({
      userId,
      itemId: item.itemId,
      eventType: "library-add",
      status: "pending",
      title: `Added to ${definition.displayName}`,
      message: `${item.title} was added to ${definition.displayName}. Episode selection is waiting for your choices.`,
      metadata: {
        serviceType,
        sonarrSeriesId: result.sonarrSeriesId,
        seasonSelectionMode: input.seasonSelectionMode,
      },
    });

    return {
      ok: true,
      message: `${item.title} was added to ${definition.displayName}. Choose episodes to monitor next.`,
      pendingEpisodeSelection: {
        sonarrSeriesId: result.sonarrSeriesId as number,
        seriesTitle: item.title,
        recommendationItemId: item.itemId,
      },
    };
  }

  await markRecommendationItemExistingInLibrary(item.itemId, true);
  await createRecommendationItemTimelineEvent({
    userId,
    itemId: item.itemId,
    eventType: "library-add",
    status: "succeeded",
    title: `Added to ${definition.displayName}`,
    message: result.message,
    metadata: {
      serviceType,
      seasonSelectionMode: input.seasonSelectionMode,
      seasonNumbers: input.seasonNumbers,
      tagIds: input.tagIds,
    },
  });

  return result;
}
