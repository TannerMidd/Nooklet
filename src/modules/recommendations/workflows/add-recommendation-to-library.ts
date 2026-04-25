import { parseRecommendationProviderMetadata } from "@/modules/recommendations/provider-metadata";
import { decryptSecret } from "@/lib/security/secret-box";
import { addLibraryItem } from "@/modules/service-connections/adapters/add-library-item";
import { parseLibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
import {
  findServiceConnectionByType,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type AddRecommendationToLibraryInput } from "@/modules/recommendations/schemas/add-to-library";
import {
  findRecommendationItemForUser,
  markRecommendationItemExistingInLibrary,
} from "@/modules/recommendations/repositories/recommendation-repository";
import { validateRecommendationLibrarySelection } from "@/modules/recommendations/workflows/recommendation-library-selection";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

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
  const connection = await findServiceConnectionByType(userId, serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before adding recommended titles.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before adding recommended titles.`,
    };
  }

  const metadata = parseLibraryManagerMetadata(connection.metadata);
  const validationResult = validateRecommendationLibrarySelection(
    metadata,
    input,
    definition.displayName,
    {
      mediaType: item.mediaType,
      availableSeasonNumbers,
    },
  );

  if (!validationResult.ok) {
    return validationResult;
  }

  const result = await addLibraryItem({
    serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    title: item.title,
    year: item.year,
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    seasonSelectionMode: input.seasonSelectionMode,
    seasonNumbers: input.seasonNumbers,
    tagIds: input.tagIds,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: result.ok
      ? "recommendations.item.library-add.succeeded"
      : "recommendations.item.library-add.failed",
    subjectType: "recommendation-item",
    subjectId: item.itemId,
    payloadJson: JSON.stringify({
      serviceType,
      title: item.title,
      year: item.year,
      rootFolderPath: input.rootFolderPath,
      qualityProfileId: input.qualityProfileId,
      seasonSelectionMode: input.seasonSelectionMode,
      seasonNumbers: input.seasonNumbers,
      tagIds: input.tagIds,
      ok: result.ok,
      message: result.message,
    }),
  });

  if (!result.ok) {
    return result;
  }

  await markRecommendationItemExistingInLibrary(item.itemId, true);

  return result;
}
