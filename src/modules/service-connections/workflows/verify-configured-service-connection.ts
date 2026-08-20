import { decryptSecret } from "@/lib/security/secret-box";
import { createAuditEvent } from "@/modules/users/public";
import { verifyServiceConnection } from "@/modules/service-connections/adapters/verify-service-connection";
import { getServiceConnectionDefinition } from "@/modules/service-connections/service-definitions";
import {
    findServiceConnectionByType,
    updateServiceConnectionVerification,
} from "@/modules/service-connections/repositories/service-connection-repository";
import { type ServiceConnectionTypeInput } from "@/modules/service-connections/schemas/service-connection";

export type VerifyConfiguredServiceConnectionResult =
    { ok: true; message: string } | { ok: false; message: string; field?: "apiKey" };

export async function verifyConfiguredServiceConnection(
    userId: string,
    serviceType: ServiceConnectionTypeInput,
): Promise<VerifyConfiguredServiceConnectionResult> {
    const record = await findServiceConnectionByType(userId, serviceType);

    if (!record || !record.secret) {
        return {
            ok: false,
            message: "Save the connection before running verification.",
        };
    }

    let secret: string;

    try {
        secret = decryptSecret(record.secret.encryptedValue);
    } catch {
        const message = "The saved credential could not be read. Enter it again before verifying.";

        await updateServiceConnectionVerification(
            record.connection.id,
            "error",
            message,
            record.metadata,
        );
        await createAuditEvent({
            actorUserId: userId,
            eventType: "service-connections.verification-failed",
            subjectType: "service-connection",
            subjectId: serviceType,
            payloadJson: JSON.stringify({
                serviceType,
                ok: false,
            }),
        });

        return { ok: false, message, field: "apiKey" };
    }

    const verificationResult = await verifyServiceConnection({
        serviceType,
        baseUrl: record.connection.baseUrl ?? "",
        secret,
        metadata: record.metadata,
    });

    await updateServiceConnectionVerification(
        record.connection.id,
        verificationResult.ok ? "verified" : "error",
        verificationResult.message,
        verificationResult.metadata,
    );

    await createAuditEvent({
        actorUserId: userId,
        eventType: verificationResult.ok
            ? "service-connections.verified"
            : "service-connections.verification-failed",
        subjectType: "service-connection",
        subjectId: serviceType,
        payloadJson: JSON.stringify({
            serviceType,
            ok: verificationResult.ok,
        }),
    });

    return {
        ok: verificationResult.ok,
        message: verificationResult.ok
            ? `${getServiceConnectionDefinition(serviceType).displayName}: ${verificationResult.message}`
            : verificationResult.message,
    };
}
