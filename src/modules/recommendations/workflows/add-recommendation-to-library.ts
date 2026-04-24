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
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type AddRecommendationToLibraryResult =
  | { ok: true; message: string }
  | {
      ok: false;
      message: string;
      field?: "rootFolderPath" | "qualityProfileId" | "tagIds";
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

  if (!metadata || metadata.rootFolders.length === 0 || metadata.qualityProfiles.length === 0) {
    return {
      ok: false,
      message: `Re-run ${definition.displayName} verification to load root folders and quality profiles.`,
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

  const result = await addLibraryItem({
    serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    title: item.title,
    year: item.year,
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
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
