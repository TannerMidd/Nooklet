import { decryptSecret } from "@/lib/security/secret-box";
import {
  createArrIndexer,
  updateArrIndexer,
  type ArrIndexerWritePayload,
} from "@/modules/service-connections/adapters/arr-indexers";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type ArrIndexerWriteInput } from "@/modules/service-connections/schemas/save-arr-indexer";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type ArrIndexerSummary } from "@/modules/service-connections/types/arr-indexers";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

type SaveArrIndexerWorkflowInput = Omit<ArrIndexerWriteInput, "returnTo">;

export type SaveArrIndexerResult =
  | { ok: true; message: string; indexer: ArrIndexerSummary }
  | { ok: false; message: string };

function buildAdapterPayload(input: SaveArrIndexerWorkflowInput): ArrIndexerWritePayload {
  return {
    name: input.name,
    implementation: input.implementation,
    implementationName: input.implementationName,
    configContract: input.configContract,
    protocol: input.protocol,
    priority: input.priority,
    enableRss: input.enableRss,
    enableAutomaticSearch: input.enableAutomaticSearch,
    enableInteractiveSearch: input.enableInteractiveSearch,
    tags: input.tags,
    fields: input.fields.map((field) => ({ name: field.name, value: field.value })),
  };
}

/**
 * Audit payload never includes field values: indexer fields routinely carry
 * API keys/passphrases. We only persist the field names plus the
 * non-sensitive descriptors so the audit trail stays useful.
 */
function buildAuditPayload(
  input: SaveArrIndexerWorkflowInput,
  extras: Record<string, unknown> = {},
) {
  return JSON.stringify({
    serviceType: input.serviceType,
    indexerId: input.id ?? null,
    name: input.name,
    implementation: input.implementation,
    protocol: input.protocol,
    enableRss: input.enableRss,
    enableAutomaticSearch: input.enableAutomaticSearch,
    enableInteractiveSearch: input.enableInteractiveSearch,
    tagCount: input.tags.length,
    fieldNames: input.fields.map((field) => field.name),
    ...extras,
  });
}

export async function saveArrIndexerForUser(
  userId: string,
  input: SaveArrIndexerWorkflowInput,
): Promise<SaveArrIndexerResult> {
  const definition = getServiceConnectionDefinition(input.serviceType);
  const connection = await findServiceConnectionByType(userId, input.serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before managing indexers.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before managing indexers.`,
    };
  }

  const baseUrl = connection.connection.baseUrl ?? "";
  const apiKey = decryptSecret(connection.secret.encryptedValue);
  const adapterPayload = buildAdapterPayload(input);
  const isUpdate = typeof input.id === "number";

  const adapterResult = isUpdate
    ? await updateArrIndexer({
        serviceType: input.serviceType,
        baseUrl,
        apiKey,
        id: input.id as number,
        payload: adapterPayload,
      })
    : await createArrIndexer({
        serviceType: input.serviceType,
        baseUrl,
        apiKey,
        payload: adapterPayload,
      });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: `service-connections.${input.serviceType}.indexer.save-failed`,
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: buildAuditPayload(input, {
        operation: isUpdate ? "update" : "create",
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to save indexer in ${definition.displayName}: ${adapterResult.message}`,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: `service-connections.${input.serviceType}.indexer.saved`,
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: buildAuditPayload(input, {
      operation: isUpdate ? "update" : "create",
      indexerId: adapterResult.value.id,
    }),
  });

  return {
    ok: true,
    message: isUpdate
      ? `Saved indexer changes in ${definition.displayName}.`
      : `Added new indexer to ${definition.displayName}.`,
    indexer: adapterResult.value,
  };
}
