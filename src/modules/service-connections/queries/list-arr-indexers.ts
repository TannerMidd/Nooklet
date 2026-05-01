import { decryptSecret } from "@/lib/security/secret-box";
import { listArrIndexers } from "@/modules/service-connections/adapters/arr-indexers";
import { type LibraryManagerServiceType } from "@/modules/service-connections/adapters/add-library-item";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type ArrIndexerSummary } from "@/modules/service-connections/types/arr-indexers";

export type ListArrIndexersForUserResult =
  | { ok: true; items: ArrIndexerSummary[] }
  | { ok: false; message: string };

export async function listArrIndexersForUser(
  userId: string,
  serviceType: LibraryManagerServiceType,
): Promise<ListArrIndexersForUserResult> {
  const definition = getServiceConnectionDefinition(serviceType);
  const connection = await findServiceConnectionByType(userId, serviceType);

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

  const result = await listArrIndexers({
    serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
  });

  if (!result.ok) {
    return { ok: false, message: result.message };
  }

  return { ok: true, items: result.value };
}
