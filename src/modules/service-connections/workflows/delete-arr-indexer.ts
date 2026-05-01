import { decryptSecret } from "@/lib/security/secret-box";
import { deleteArrIndexer } from "@/modules/service-connections/adapters/arr-indexers";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/repositories/user-repository";

export interface DeleteArrIndexerWorkflowInput {
  serviceType: LibraryManagerServiceType;
  id: number;
}

export type DeleteArrIndexerResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

export async function deleteArrIndexerForUser(
  userId: string,
  input: DeleteArrIndexerWorkflowInput,
): Promise<DeleteArrIndexerResult> {
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

  const adapterResult = await deleteArrIndexer({
    serviceType: input.serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    id: input.id,
  });

  if (!adapterResult.ok) {
    await createAuditEvent({
      actorUserId: userId,
      eventType: `service-connections.${input.serviceType}.indexer.delete-failed`,
      subjectType: "service-connection",
      subjectId: connection.connection.id,
      payloadJson: JSON.stringify({
        serviceType: input.serviceType,
        indexerId: input.id,
        message: adapterResult.message,
      }),
    });

    return {
      ok: false,
      message: `Failed to delete indexer from ${definition.displayName}: ${adapterResult.message}`,
    };
  }

  await createAuditEvent({
    actorUserId: userId,
    eventType: `service-connections.${input.serviceType}.indexer.deleted`,
    subjectType: "service-connection",
    subjectId: connection.connection.id,
    payloadJson: JSON.stringify({
      serviceType: input.serviceType,
      indexerId: input.id,
    }),
  });

  return {
    ok: true,
    message: `Removed indexer from ${definition.displayName}.`,
  };
}
