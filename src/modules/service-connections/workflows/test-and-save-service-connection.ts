import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security/secret-box";
import { verifyServiceConnection } from "@/modules/service-connections/adapters/verify-service-connection";
import {
  findServiceConnectionByType,
  saveServiceConnection,
  updateServiceConnectionVerification,
} from "@/modules/service-connections/repositories/service-connection-repository";
import {
  type AiProviderConnectionInput,
  type ApiKeyServiceConnectionInput,
} from "@/modules/service-connections/schemas/service-connection";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import { createAuditEvent } from "@/modules/users/public";

type TestAndSaveInput = AiProviderConnectionInput | ApiKeyServiceConnectionInput;

export type TestAndSaveServiceConnectionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; field?: "apiKey" };

/**
 * Verifies draft values before replacing the saved connection. A failed draft
 * therefore cannot take a working integration offline.
 */
export async function testAndSaveServiceConnection(
  userId: string,
  input: TestAndSaveInput,
): Promise<TestAndSaveServiceConnectionResult> {
  const existingRecord = await findServiceConnectionByType(userId, input.serviceType);
  const newSecret = input.apiKey.trim();

  if (!newSecret && !existingRecord?.secret) {
    return {
      ok: false,
      message: input.serviceType === "usenet-server" || input.serviceType === "trakt"
        ? "Enter the required credentials before testing."
        : "Enter the API key or token before testing.",
      field: "apiKey",
    };
  }

  let secret = newSecret;
  if (!secret && existingRecord?.secret) {
    try {
      secret = decryptSecret(existingRecord.secret.encryptedValue);
    } catch {
      return {
        ok: false,
        message: "The saved credential could not be read. Enter it again before testing.",
        field: "apiKey",
      };
    }
  }

  const draftMetadata = input.serviceType === "ai-provider"
    ? { model: input.model }
    : null;
  const verification = await verifyServiceConnection({
    serviceType: input.serviceType,
    baseUrl: input.baseUrl,
    secret,
    metadata: draftMetadata,
  });

  await createAuditEvent({
    actorUserId: userId,
    eventType: verification.ok
      ? "service-connections.draft-verified"
      : "service-connections.draft-verification-failed",
    subjectType: "service-connection",
    subjectId: input.serviceType,
    payloadJson: JSON.stringify({
      serviceType: input.serviceType,
      baseUrl: input.baseUrl,
      ok: verification.ok,
    }),
  });

  if (!verification.ok) {
    return {
      ok: false,
      message: `${verification.message} Your previously saved connection was not changed.`,
    };
  }

  const definition = getServiceConnectionDefinition(input.serviceType);
  const metadata = verification.metadata ?? draftMetadata;
  const saved = await saveServiceConnection({
    userId,
    serviceType: input.serviceType,
    displayName: definition.displayName,
    baseUrl: input.baseUrl,
    status: "verified",
    statusMessage: verification.message,
    metadata,
    secretUpdate: newSecret
      ? {
          encryptedValue: encryptSecret(newSecret),
          maskedValue: maskSecret(newSecret),
        }
      : undefined,
  });

  if (!saved) {
    return {
      ok: false,
      message: "The connection test succeeded, but Nooklet could not save the configuration.",
    };
  }

  await updateServiceConnectionVerification(
    saved.connection.id,
    "verified",
    verification.message,
    metadata,
  );

  return {
    ok: true,
    message: `${definition.displayName} connected and saved.`,
  };
}
