import { type ServiceConnectionType } from "@/lib/database/schema";
import { parseLibraryManagerMetadata } from "@/modules/service-connections/library-manager-metadata";
import { parsePlexMetadata } from "@/modules/service-connections/plex-metadata";
import { parseSabnzbdMetadata } from "@/modules/service-connections/sabnzbd-metadata";
import { serviceConnectionDefinitions } from "@/modules/service-connections/service-definitions";
import { parseTautulliMetadata } from "@/modules/service-connections/tautulli-metadata";
import { listServiceConnections } from "@/modules/service-connections/repositories/service-connection-repository";

type RemoteUserOption = {
  id: string;
  name: string;
};

export type ServiceConnectionSummary = {
  serviceType: ServiceConnectionType;
  displayName: string;
  description: string;
  baseUrl: string;
  status: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  maskedSecret: string | null;
  model: string | null;
  availableModels: string[];
  serverName: string | null;
  availableUsers: RemoteUserOption[];
  rootFolders: Array<{ path: string; label: string }>;
  qualityProfiles: Array<{ id: number; name: string }>;
  tags: Array<{ id: number; label: string }>;
  sabnzbdVersion: string | null;
  activeQueueCount: number;
  queuePaused: boolean;
  queueStatus: string | null;
  lastVerifiedAt: Date | null;
};

function parseAvailableModels(metadata: Record<string, unknown> | null) {
  if (!Array.isArray(metadata?.availableModels)) {
    return [];
  }

  return metadata.availableModels.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
}

export async function listConnectionSummaries(userId: string) {
  const records = await listServiceConnections(userId);
  const recordByType = new Map(records.map((record) => [record.connection.serviceType, record]));

  return serviceConnectionDefinitions.map((definition) => {
    const record = recordByType.get(definition.serviceType);

    if (!record) {
      return {
        serviceType: definition.serviceType,
        displayName: definition.displayName,
        description: definition.description,
        baseUrl: definition.defaultBaseUrl,
        status: "disconnected",
        statusMessage: "No saved configuration.",
        maskedSecret: null,
        model: null,
        availableModels: [],
        serverName: null,
        availableUsers: [],
        rootFolders: [],
        qualityProfiles: [],
        tags: [],
        sabnzbdVersion: null,
        activeQueueCount: 0,
        queuePaused: false,
        queueStatus: null,
        lastVerifiedAt: null,
      } satisfies ServiceConnectionSummary;
    }

    const libraryMetadata = parseLibraryManagerMetadata(record.metadata);
    const plexMetadata = parsePlexMetadata(record.metadata);
    const sabnzbdMetadata = parseSabnzbdMetadata(record.metadata);
    const tautulliMetadata = parseTautulliMetadata(record.metadata);
    const traktDisplayName =
      typeof record.metadata?.displayName === "string"
        ? record.metadata.displayName
        : typeof record.metadata?.username === "string"
          ? record.metadata.username
          : null;

    return {
      serviceType: definition.serviceType,
      displayName: definition.displayName,
      description: definition.description,
      baseUrl: record.connection.baseUrl ?? definition.defaultBaseUrl,
      status: record.connection.status,
      statusMessage: record.connection.statusMessage ?? "Saved configuration.",
      maskedSecret: record.secret?.maskedValue ?? null,
      model:
        typeof record.metadata?.model === "string" ? (record.metadata.model as string) : null,
      availableModels: parseAvailableModels(record.metadata),
      serverName: tautulliMetadata?.serverName ?? plexMetadata?.serverName ?? traktDisplayName,
      availableUsers: tautulliMetadata?.availableUsers ?? plexMetadata?.availableUsers ?? [],
      rootFolders: libraryMetadata?.rootFolders ?? [],
      qualityProfiles: libraryMetadata?.qualityProfiles ?? [],
      tags: libraryMetadata?.tags ?? [],
      sabnzbdVersion: sabnzbdMetadata?.version ?? null,
      activeQueueCount: sabnzbdMetadata?.activeQueueCount ?? 0,
      queuePaused: sabnzbdMetadata?.queuePaused ?? false,
      queueStatus: sabnzbdMetadata?.queueStatus ?? null,
      lastVerifiedAt: record.connection.lastVerifiedAt,
    } satisfies ServiceConnectionSummary;
  });
}
