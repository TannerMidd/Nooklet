import { type ServiceConnectionType } from "@/lib/database/schema";
import { serviceConnectionDefinitions } from "@/modules/service-connections/service-definitions";
import { listServiceConnections } from "@/modules/service-connections/repositories/service-connection-repository";

export type ServiceConnectionSummary = {
  serviceType: ServiceConnectionType;
  displayName: string;
  description: string;
  baseUrl: string;
  status: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  maskedSecret: string | null;
  model: string | null;
  lastVerifiedAt: Date | null;
};

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
        lastVerifiedAt: null,
      } satisfies ServiceConnectionSummary;
    }

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
      lastVerifiedAt: record.connection.lastVerifiedAt,
    } satisfies ServiceConnectionSummary;
  });
}
