import { decryptSecret } from "@/lib/security/secret-box";
import {
  createDownloadClient,
  findDownloadClientByServiceConnectionId,
} from "@/modules/downloads/repositories/download-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { QueueIndexerResultWorkflowError } from "./errors";

type DownloadClientRecord = NonNullable<Awaited<ReturnType<typeof findDownloadClientByServiceConnectionId>>>;

export type ResolvedSabnzbdDownloadClient = {
  client: DownloadClientRecord;
  baseUrl: string;
  apiKey: string;
};

export async function resolveSabnzbdDownloadClient(userId: string): Promise<ResolvedSabnzbdDownloadClient> {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");

  if (!connection?.secret || !connection.connection.baseUrl) {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_not_connected",
      "Connect SABnzbd before queueing releases.",
    );
  }

  if (connection.connection.status !== "verified") {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_not_verified",
      connection.connection.statusMessage ?? "Verify SABnzbd before queueing releases.",
    );
  }

  const existingClient = await findDownloadClientByServiceConnectionId(userId, connection.connection.id);
  const client = existingClient ?? await createDownloadClient({
    userId,
    serviceConnectionId: connection.connection.id,
    clientType: "sabnzbd",
    displayName: connection.connection.displayName,
    status: "verified",
    isDefault: true,
  });

  if (!client) {
    throw new QueueIndexerResultWorkflowError(
      "download_request_failed",
      "Nooklet could not prepare the SABnzbd download client.",
    );
  }

  return {
    client,
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
  };
}
