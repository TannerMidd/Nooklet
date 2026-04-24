import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
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

function parseMetadata(metadataJson: string | null) {
  if (!metadataJson) {
    return null;
  }

  try {
    return JSON.parse(metadataJson) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function findServiceConnectionByType(
  userId: string,
  serviceType: ServiceConnectionType,
) {
  const database = ensureDatabaseReady();

  const connection =
    database
      .select()
      .from(serviceConnections)
      .where(
        and(
          eq(serviceConnections.ownerUserId, userId),
          eq(serviceConnections.serviceType, serviceType),
        ),
      )
      .get() ?? null;

  if (!connection) {
    return null;
  }

  const secret =
    database
      .select()
      .from(serviceSecrets)
      .where(eq(serviceSecrets.connectionId, connection.id))
      .get() ?? null;

  return {
    connection,
    secret,
    metadata: parseMetadata(connection.metadataJson),
  } satisfies ServiceConnectionRecord;
}

export async function listServiceConnections(userId: string) {
  const database = ensureDatabaseReady();
  const connections = database
    .select()
    .from(serviceConnections)
    .where(eq(serviceConnections.ownerUserId, userId))
    .all();

  const secrets = database.select().from(serviceSecrets).all();
  const secretByConnectionId = new Map(secrets.map((secret) => [secret.connectionId, secret]));

  return connections.map((connection) => ({
    connection,
    secret: secretByConnectionId.get(connection.id) ?? null,
    metadata: parseMetadata(connection.metadataJson),
  })) satisfies ServiceConnectionRecord[];
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
  const existingRecord = await findServiceConnectionByType(input.userId, input.serviceType);
  const metadataJson = input.metadata ? JSON.stringify(input.metadata) : null;

  if (existingRecord) {
    database
      .update(serviceConnections)
      .set({
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

    return findServiceConnectionByType(input.userId, input.serviceType);
  }

  const connectionId = randomUUID();

  database
    .insert(serviceConnections)
    .values({
      id: connectionId,
      serviceType: input.serviceType,
      ownershipScope: "user",
      ownerUserId: input.userId,
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

  return findServiceConnectionByType(input.userId, input.serviceType);
}

export async function updateServiceConnectionVerification(
  connectionId: string,
  status: ServiceConnectionStatus,
  statusMessage: string,
) {
  const database = ensureDatabaseReady();

  database
    .update(serviceConnections)
    .set({
      status,
      statusMessage,
      lastVerifiedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(serviceConnections.id, connectionId))
    .run();
}

export async function deleteServiceConnection(
  userId: string,
  serviceType: ServiceConnectionType,
) {
  const database = ensureDatabaseReady();
  const record = await findServiceConnectionByType(userId, serviceType);

  if (!record) {
    return false;
  }

  database
    .delete(serviceSecrets)
    .where(eq(serviceSecrets.connectionId, record.connection.id))
    .run();
  database.delete(serviceConnections).where(eq(serviceConnections.id, record.connection.id)).run();

  return true;
}
