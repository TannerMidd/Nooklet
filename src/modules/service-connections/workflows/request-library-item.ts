import { decryptSecret } from "@/lib/security/secret-box";
import { updateLibrarySelectionDefaults } from "@/modules/preferences/repositories/preferences-repository";
import {
  addLibraryItem,
  type LibraryManagerServiceType,
} from "@/modules/service-connections/adapters/add-library-item";
import { refreshLibraryManagerRootFolderFreeSpace } from "@/modules/service-connections/adapters/library-manager-root-folder-space";
import {
  parseLibraryManagerMetadata,
  type LibraryManagerMetadata,
} from "@/modules/service-connections/library-manager-metadata";
import {
  findServiceConnectionByType,
  type ServiceConnectionRecord,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { validateRecommendationLibrarySelection } from "@/modules/recommendations/workflows/recommendation-library-selection";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type RequestLibraryItemInput = {
  serviceType: LibraryManagerServiceType;
  title: string;
  year: number | null;
  rootFolderPath: string;
  qualityProfileId: number;
  seasonSelectionMode: "all" | "custom" | "episode";
  seasonNumbers: number[];
  tagIds: number[];
};

export type RequestLibraryItemResult =
  | { ok: true; message: string; sonarrSeriesId?: number }
  | {
      ok: false;
      message: string;
      field?: "rootFolderPath" | "qualityProfileId" | "seasonNumbers" | "tagIds";
    };

type RequestLibraryItemOptions = {
  availableSeasonNumbers?: number[];
  subjectType: string;
  subjectId?: string;
  eventTypePrefix: string;
  configureMessage?: string;
  verifyMessage?: string;
  auditPayload?: Record<string, unknown>;
};

async function resolveLibraryManagerRequestMetadata(
  connection: ServiceConnectionRecord,
  apiKey: string,
): Promise<LibraryManagerMetadata | null> {
  const metadata = parseLibraryManagerMetadata(connection.metadata);

  if (!metadata || !connection.connection.baseUrl || metadata.rootFolders.length === 0) {
    return metadata;
  }

  try {
    const rootFolders = await refreshLibraryManagerRootFolderFreeSpace({
      baseUrl: connection.connection.baseUrl,
      apiKey,
      rootFolders: metadata.rootFolders,
    });

    return {
      ...metadata,
      rootFolders,
    };
  } catch {
    return metadata;
  }
}

export async function requestLibraryItem(
  userId: string,
  input: RequestLibraryItemInput,
  options: RequestLibraryItemOptions,
): Promise<RequestLibraryItemResult> {
  const definition = getServiceConnectionDefinition(input.serviceType);
  const connection = await findServiceConnectionByType(userId, input.serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      message: options.configureMessage ?? `Configure ${definition.displayName} before continuing.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: options.verifyMessage ?? `Verify ${definition.displayName} before continuing.`,
    };
  }

  const apiKey = decryptSecret(connection.secret.encryptedValue);
  const metadata = await resolveLibraryManagerRequestMetadata(connection, apiKey);

  const validationResult = validateRecommendationLibrarySelection(
    metadata,
    input,
    definition.displayName,
    {
      mediaType: input.serviceType === "sonarr" ? "tv" : "movie",
      availableSeasonNumbers: options.availableSeasonNumbers,
    },
  );

  if (!validationResult.ok) {
    return validationResult;
  }

  await updateLibrarySelectionDefaults(userId, input.serviceType, {
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
  });

  const result = await addLibraryItem({
    serviceType: input.serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey,
    title: input.title,
    year: input.year,
    rootFolderPath: input.rootFolderPath,
    qualityProfileId: input.qualityProfileId,
    seasonSelectionMode: input.seasonSelectionMode,
    seasonNumbers: input.seasonNumbers,
    tagIds: input.tagIds,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: `${options.eventTypePrefix}.${result.ok ? "succeeded" : "failed"}`,
    subjectType: options.subjectType,
    subjectId: options.subjectId ?? connection.connection.id,
    payloadJson: JSON.stringify({
      serviceType: input.serviceType,
      title: input.title,
      year: input.year,
      rootFolderPath: input.rootFolderPath,
      qualityProfileId: input.qualityProfileId,
      seasonSelectionMode: input.seasonSelectionMode,
      seasonNumbers: input.seasonNumbers,
      tagIds: input.tagIds,
      ok: result.ok,
      message: result.message,
      ...options.auditPayload,
    }),
  });

  return result;
}