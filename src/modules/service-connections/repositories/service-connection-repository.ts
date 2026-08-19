import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import { resolveInstanceConfigurationOwnerId } from "@/modules/instance-config/resolve-instance-configuration-owner";
import { decryptSecretWithMetadata, encryptSecret } from "@/lib/security/secret-box";
import {
    serviceConnections,
    serviceSecrets,
    type ServiceConnectionStatus,
    type ServiceConnectionType,
} from "@/lib/database/schema";

export type StoredServiceConnection = typeof serviceConnections.$inferSelect;
export type StoredServiceSecret = typeof serviceSecrets.$inferSelect;

export type ServiceConnectionRecord = {
    connection: StoredServiceConnection;
    secret: StoredServiceSecret | null;
    metadata: Record<string, unknown> | null;
};

const instanceServiceConnectionTypes = new Set<ServiceConnectionType>([
    "ai-provider",
    "plex",
    "tautulli",
    "tmdb",
    "tvdb",
    "usenet-server",
    "youtube",
]);

async function resolveServiceConnectionOwnerId(userId: string, serviceType: ServiceConnectionType) {
    return instanceServiceConnectionTypes.has(serviceType)
        ? resolveInstanceConfigurationOwnerId(userId)
        : userId;
}

function parseMetadata(metadataJson: string | null) {
    if (!metadataJson) {
        return null;
    }

    try {
        return JSON.parse(metadataJson) as Record<string, unknown>;
    } catch (error) {
        console.error("[service-connection-repository] failed to parse metadataJson", error);

        return null;
    }
}

function rotateStoredSecret(secret: StoredServiceSecret | null): StoredServiceSecret | null {
    if (!secret) {
        return null;
    }

    try {
        const decrypted = decryptSecretWithMetadata(secret.encryptedValue);

        if (!decrypted.needsRotation) {
            return secret;
        }

        const encryptedValue = encryptSecret(decrypted.value);
        const updatedAt = new Date();

        ensureDatabaseReady()
            .update(serviceSecrets)
            .set({ encryptedValue, updatedAt })
            .where(eq(serviceSecrets.connectionId, secret.connectionId))
            .run();

        return { ...secret, encryptedValue, updatedAt };
    } catch {
        // Preserve the record so settings remain recoverable when an operator has
        // not yet supplied the previous key. The consuming workflow will surface
        // a decryption failure when the credential is actually used.
        return secret;
    }
}

function findOwnedConnectionByType(userId: string, serviceType: ServiceConnectionType) {
    const database = ensureDatabaseReady();

    return (
        database
            .select()
            .from(serviceConnections)
            .where(
                and(
                    eq(serviceConnections.ownerUserId, userId),
                    eq(serviceConnections.serviceType, serviceType),
                ),
            )
            .get() ?? null
    );
}

function hydrateConnection(connection: StoredServiceConnection): ServiceConnectionRecord {
    const database = ensureDatabaseReady();

    const secret = rotateStoredSecret(
        database
            .select()
            .from(serviceSecrets)
            .where(eq(serviceSecrets.connectionId, connection.id))
            .get() ?? null,
    );

    return {
        connection,
        secret,
        metadata: parseMetadata(connection.metadataJson),
    } satisfies ServiceConnectionRecord;
}

export async function findServiceConnectionByType(
    userId: string,
    serviceType: ServiceConnectionType,
) {
    const ownerUserId = await resolveServiceConnectionOwnerId(userId, serviceType);
    const connection = findOwnedConnectionByType(ownerUserId, serviceType);

    return connection ? hydrateConnection(connection) : null;
}

export type ServiceConnectionSummaryRecord = {
    connection: StoredServiceConnection;
    maskedSecret: string | null;
    metadata: Record<string, unknown> | null;
};

/**
 * Loads the settings projection without reading encrypted credential values.
 * Decryption and lazy key rotation belong only on workflows that consume a
 * specific credential, never on a summary page.
 */
export async function listServiceConnectionSummaryRecords(userId: string) {
    const database = ensureDatabaseReady();
    const instanceOwnerId = await resolveInstanceConfigurationOwnerId(userId);
    const ownedConnections = database
        .select()
        .from(serviceConnections)
        .where(eq(serviceConnections.ownerUserId, userId))
        .all();
    const instanceConnections = database
        .select()
        .from(serviceConnections)
        .where(eq(serviceConnections.ownerUserId, instanceOwnerId))
        .all()
        .filter((connection) => instanceServiceConnectionTypes.has(connection.serviceType));
    const personalConnections = ownedConnections.filter(
        (connection) => !instanceServiceConnectionTypes.has(connection.serviceType),
    );
    const connectionByType = new Map(
        instanceConnections.map((connection) => [connection.serviceType, connection] as const),
    );

    for (const connection of personalConnections) {
        connectionByType.set(connection.serviceType, connection);
    }

    const connections = [...connectionByType.values()];

    const maskedSecrets =
        connections.length === 0
            ? []
            : database
                  .select({
                      connectionId: serviceSecrets.connectionId,
                      maskedValue: serviceSecrets.maskedValue,
                  })
                  .from(serviceSecrets)
                  .where(
                      inArray(
                          serviceSecrets.connectionId,
                          connections.map((connection) => connection.id),
                      ),
                  )
                  .all();
    const maskedSecretByConnectionId = new Map(
        maskedSecrets.map((secret) => [secret.connectionId, secret.maskedValue] as const),
    );

    return connections.map((connection) => ({
        connection,
        maskedSecret: maskedSecretByConnectionId.get(connection.id) ?? null,
        metadata: parseMetadata(connection.metadataJson),
    })) satisfies ServiceConnectionSummaryRecord[];
}

type SaveServiceConnectionInput = {
    userId: string;
    serviceType: ServiceConnectionType;
    displayName: string;
    baseUrl: string;
    status: ServiceConnectionStatus;
    statusMessage: string;
    metadata: Record<string, unknown> | null;
    secretUpdate?: {
        encryptedValue: string;
        maskedValue: string;
    };
};

export async function saveServiceConnection(input: SaveServiceConnectionInput) {
    const database = ensureDatabaseReady();
    const ownerUserId = await resolveServiceConnectionOwnerId(input.userId, input.serviceType);
    const existingConnection = findOwnedConnectionByType(ownerUserId, input.serviceType);
    const existingRecord = existingConnection ? hydrateConnection(existingConnection) : null;
    const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

    if (existingRecord) {
        database
            .update(serviceConnections)
            .set({
                ownershipScope: instanceServiceConnectionTypes.has(input.serviceType)
                    ? "shared"
                    : "user",
                baseUrl: input.baseUrl,
                displayName: input.displayName,
                status: input.status,
                statusMessage: input.statusMessage,
                metadataJson,
                updatedAt: new Date(),
            })
            .where(eq(serviceConnections.id, existingRecord.connection.id))
            .run();

        if (input.secretUpdate) {
            database
                .insert(serviceSecrets)
                .values({
                    connectionId: existingRecord.connection.id,
                    encryptedValue: input.secretUpdate.encryptedValue,
                    maskedValue: input.secretUpdate.maskedValue,
                    updatedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: serviceSecrets.connectionId,
                    set: {
                        encryptedValue: input.secretUpdate.encryptedValue,
                        maskedValue: input.secretUpdate.maskedValue,
                        updatedAt: new Date(),
                    },
                })
                .run();
        }

        const updated = findOwnedConnectionByType(ownerUserId, input.serviceType);

        return updated ? hydrateConnection(updated) : null;
    }

    const connectionId = randomUUID();

    database
        .insert(serviceConnections)
        .values({
            id: connectionId,
            serviceType: input.serviceType,
            ownershipScope: instanceServiceConnectionTypes.has(input.serviceType)
                ? "shared"
                : "user",
            ownerUserId,
            displayName: input.displayName,
            baseUrl: input.baseUrl,
            status: input.status,
            statusMessage: input.statusMessage,
            metadataJson,
        })
        .run();

    if (input.secretUpdate) {
        database
            .insert(serviceSecrets)
            .values({
                connectionId,
                encryptedValue: input.secretUpdate.encryptedValue,
                maskedValue: input.secretUpdate.maskedValue,
            })
            .run();
    }

    return findServiceConnectionByType(ownerUserId, input.serviceType);
}

export async function updateServiceConnectionVerification(
    connectionId: string,
    status: ServiceConnectionStatus,
    statusMessage: string,
    metadata?: Record<string, unknown> | null,
) {
    const database = ensureDatabaseReady();

    database
        .update(serviceConnections)
        .set({
            status,
            statusMessage,
            ...(metadata === undefined
                ? {}
                : {
                      metadataJson: metadata ? JSON.stringify(metadata) : null,
                  }),
            lastVerifiedAt: new Date(),
            updatedAt: new Date(),
        })
        .where(eq(serviceConnections.id, connectionId))
        .run();
}

export async function deleteServiceConnection(userId: string, serviceType: ServiceConnectionType) {
    const database = ensureDatabaseReady();
    const ownerUserId = await resolveServiceConnectionOwnerId(userId, serviceType);
    const connection = findOwnedConnectionByType(ownerUserId, serviceType);
    const record = connection ? hydrateConnection(connection) : null;

    if (!record) {
        return false;
    }

    database
        .delete(serviceSecrets)
        .where(eq(serviceSecrets.connectionId, record.connection.id))
        .run();
    database
        .delete(serviceConnections)
        .where(eq(serviceConnections.id, record.connection.id))
        .run();

    return true;
}
