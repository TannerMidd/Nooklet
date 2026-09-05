import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security/secret-box";
import { CredentialUrlError, assertCredentialFreeUrl } from "@/lib/security/credential-url";
import { createAuditEvent } from "@/modules/users/public";
import {
    type AiProviderConnectionInput,
    type ApiKeyServiceConnectionInput,
} from "@/modules/service-connections/schemas/service-connection";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import {
    findServiceConnectionByType,
    saveServiceConnection,
} from "@/modules/service-connections/repositories/service-connection-repository";

type SaveServiceConnectionInput = AiProviderConnectionInput | ApiKeyServiceConnectionInput;

export type SaveServiceConnectionResult =
    { ok: true; message: string } | { ok: false; message: string; field?: "apiKey" | "baseUrl" };

export async function saveConfiguredServiceConnection(
    userId: string,
    input: SaveServiceConnectionInput,
): Promise<SaveServiceConnectionResult> {
    try {
        assertCredentialFreeUrl(input.baseUrl);
    } catch (error) {
        return {
            ok: false,
            message:
                error instanceof CredentialUrlError && error.code === "invalid"
                    ? "Enter a valid base URL."
                    : "Base URLs must not contain embedded credentials.",
            field: "baseUrl",
        };
    }

    const existingRecord = await findServiceConnectionByType(userId, input.serviceType);
    const secretValue = input.apiKey.trim();

    if (!secretValue && !existingRecord?.secret) {
        return {
            ok: false,
            message: "Enter the API key for this service.",
            field: "apiKey",
        };
    }

    if (!secretValue && existingRecord?.secret) {
        try {
            decryptSecret(existingRecord.secret.encryptedValue);
        } catch {
            return {
                ok: false,
                message: "The saved credential could not be read. Enter it again before saving.",
                field: "apiKey",
            };
        }
    }

    const definition = getServiceConnectionDefinition(input.serviceType);
    const metadata = buildServiceConnectionMetadata(existingRecord, input, secretValue);

    await saveServiceConnection({
        userId,
        serviceType: input.serviceType,
        displayName: definition.displayName,
        baseUrl: input.baseUrl,
        status: "configured",
        statusMessage: "Configuration saved. Run verify to confirm connectivity.",
        metadata,
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
        }),
    });

    return {
        ok: true,
        message: `${definition.displayName} configuration saved.`,
    };
}

function shouldPreserveConnectionMetadata(
    existingRecord: Awaited<ReturnType<typeof findServiceConnectionByType>>,
    input: SaveServiceConnectionInput,
    secretValue: string,
) {
    return existingRecord?.connection.baseUrl === input.baseUrl && !secretValue;
}

function buildServiceConnectionMetadata(
    existingRecord: Awaited<ReturnType<typeof findServiceConnectionByType>>,
    input: SaveServiceConnectionInput,
    secretValue: string,
) {
    const preservedMetadata = shouldPreserveConnectionMetadata(existingRecord, input, secretValue)
        ? (existingRecord?.metadata ?? null)
        : null;

    if (input.serviceType === "ai-provider") {
        return {
            ...(preservedMetadata ?? {}),
            model: input.model,
        };
    }

    return preservedMetadata;
}
