import { encryptSecret, maskSecret } from "@/lib/security/secret-box";
import {
  createAuditEvent,
} from "@/modules/users/repositories/user-repository";
import {
  type AiProviderConnectionInput,
  type MediaConnectionInput,
} from "@/modules/service-connections/schemas/service-connection";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import {
  findServiceConnectionByType,
  saveServiceConnection,
} from "@/modules/service-connections/repositories/service-connection-repository";

type SaveServiceConnectionInput = AiProviderConnectionInput | MediaConnectionInput;

export type SaveServiceConnectionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "apiKey" };

export async function saveConfiguredServiceConnection(
  userId: string,
  input: SaveServiceConnectionInput,
): Promise<SaveServiceConnectionResult> {
  const existingRecord = await findServiceConnectionByType(userId, input.serviceType);
  const secretValue = input.apiKey.trim();

  if (!secretValue && !existingRecord?.secret) {
    return {
      ok: false,
      message: "Enter the API key for this service.",
      field: "apiKey",
    };
  }

  const definition = getServiceConnectionDefinition(input.serviceType);

  await saveServiceConnection({
    userId,
    serviceType: input.serviceType,
    displayName: definition.displayName,
    baseUrl: input.baseUrl,
    status: "configured",
    statusMessage: "Configuration saved. Run verify to confirm connectivity.",
    metadata: input.serviceType === "ai-provider" ? { model: input.model } : null,
    secretUpdate: secretValue
      ? {
          encryptedValue: encryptSecret(secretValue),
          maskedValue: maskSecret(secretValue),
        }
      : undefined,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: "service-connections.saved",
    subjectType: "service-connection",
    subjectId: input.serviceType,
    payloadJson: JSON.stringify({
      serviceType: input.serviceType,
      baseUrl: input.baseUrl,
    }),
  });

  return {
    ok: true,
    message: `${definition.displayName} configuration saved.`,
  };
}
