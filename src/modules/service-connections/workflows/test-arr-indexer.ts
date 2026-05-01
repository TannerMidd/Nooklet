import { decryptSecret } from "@/lib/security/secret-box";
import {
  testArrIndexer,
  type ArrIndexerWritePayload,
} from "@/modules/service-connections/adapters/arr-indexers";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import { type ArrIndexerTestInput } from "@/modules/service-connections/schemas/test-arr-indexer";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { type ArrIndexerTestResult } from "@/modules/service-connections/types/arr-indexers";

export type TestArrIndexerResult =
  | { ok: true; value: ArrIndexerTestResult }
  | { ok: false; message: string };

function buildAdapterPayload(input: ArrIndexerTestInput): ArrIndexerWritePayload {
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

export async function testArrIndexerForUser(
  userId: string,
  input: ArrIndexerTestInput,
): Promise<TestArrIndexerResult> {
  const definition = getServiceConnectionDefinition(input.serviceType);
  const connection = await findServiceConnectionByType(userId, input.serviceType);

  if (!connection?.secret) {
    return {
      ok: false,
      message: `Configure ${definition.displayName} before testing indexers.`,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      ok: false,
      message: `Verify ${definition.displayName} before testing indexers.`,
    };
  }

  const adapterResult = await testArrIndexer({
    serviceType: input.serviceType,
    baseUrl: connection.connection.baseUrl ?? "",
    apiKey: decryptSecret(connection.secret.encryptedValue),
    payload: buildAdapterPayload(input),
  });

  if (!adapterResult.ok) {
    return { ok: false, message: adapterResult.message };
  }

  return { ok: true, value: adapterResult.value };
}
