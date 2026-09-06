import { type ServiceConnectionType } from "@/lib/database/schema";
import {
    inspectCredentialBearingUrl,
    redactUrlForDisplay,
    sanitizeExternalErrorMessage,
} from "@/lib/security/credential-url";
import { parsePlexMetadata } from "@/modules/service-connections/plex-metadata";
import { serviceConnectionDefinitions } from "@/modules/service-connections/service-definitions";
import { parseTautulliMetadata } from "@/modules/service-connections/tautulli-metadata";
import { listServiceConnectionSummaryRecords } from "@/modules/service-connections/repositories/service-connection-repository";

type RemoteUserOption = {
    id: string;
    name: string;
};

export type ServiceConnectionSummary = {
    serviceType: ServiceConnectionType;
    displayName: string;
    description: string;
    baseUrl: string;
    hasEmbeddedCredentials: boolean;
    status: "disconnected" | "configured" | "verified" | "error";
    statusMessage: string;
    maskedSecret: string | null;
    model: string | null;
    availableModels: string[];
    serverName: string | null;
    availableUsers: RemoteUserOption[];
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
    const records = await listServiceConnectionSummaryRecords(userId);
    const recordByType = new Map(records.map((record) => [record.connection.serviceType, record]));

    return serviceConnectionDefinitions.map((definition) => {
        const record = recordByType.get(definition.serviceType);

        if (!record) {
            return {
                serviceType: definition.serviceType,
                displayName: definition.displayName,
                description: definition.description,
                baseUrl: definition.defaultBaseUrl,
                hasEmbeddedCredentials: false,
                status: "disconnected",
                statusMessage: "No saved configuration.",
                maskedSecret: null,
                model: null,
                availableModels: [],
                serverName: null,
                availableUsers: [],
                lastVerifiedAt: null,
            } satisfies ServiceConnectionSummary;
        }

        const plexMetadata = parsePlexMetadata(record.metadata);
        const tautulliMetadata = parseTautulliMetadata(record.metadata);
        const traktDisplayName =
            typeof record.metadata?.displayName === "string"
                ? record.metadata.displayName
                : typeof record.metadata?.username === "string"
                  ? record.metadata.username
                  : null;

        const configuredBaseUrl = record.connection.baseUrl ?? definition.defaultBaseUrl;
        const baseUrlInspection = inspectCredentialBearingUrl(configuredBaseUrl);
        const hasConfiguredBaseUrl = record.connection.baseUrl !== null;
        const hasUnsafeBaseUrl =
            hasConfiguredBaseUrl &&
            (!baseUrlInspection.valid || baseUrlInspection.hasEmbeddedCredentials);
        const status = hasUnsafeBaseUrl ? "error" : record.connection.status;
        const statusMessage = hasUnsafeBaseUrl
            ? baseUrlInspection.issue === "invalid"
                ? "The saved base URL is invalid. Replace it before verifying."
                : "The saved base URL contains embedded credentials. Replace it before verifying."
            : sanitizeExternalErrorMessage(
                  record.connection.statusMessage ?? "Saved configuration.",
                  "Connection status is unavailable.",
              );

        return {
            serviceType: definition.serviceType,
            displayName: definition.displayName,
            description: definition.description,
            baseUrl: redactUrlForDisplay(configuredBaseUrl),
            hasEmbeddedCredentials: hasUnsafeBaseUrl,
            status,
            statusMessage,
            maskedSecret: record.maskedSecret,
            model:
                typeof record.metadata?.model === "string"
                    ? (record.metadata.model as string)
                    : null,
            availableModels: parseAvailableModels(record.metadata),
            serverName:
                tautulliMetadata?.serverName ?? plexMetadata?.serverName ?? traktDisplayName,
            availableUsers: tautulliMetadata?.availableUsers ?? plexMetadata?.availableUsers ?? [],
            lastVerifiedAt: record.connection.lastVerifiedAt,
        } satisfies ServiceConnectionSummary;
    });
}
