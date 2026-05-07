import { decryptSecret } from "@/lib/security/secret-box";
import {
  createDownloadClient,
  findDownloadClientByServiceConnectionId,
} from "@/modules/downloads/repositories/download-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { ImportCompletedDownloadsWorkflowError } from "./errors";

type DownloadClientRecord = NonNullable<Awaited<ReturnType<typeof findDownloadClientByServiceConnectionId>>>;

export type ResolvedImportSabnzbdClient = {
  client: DownloadClientRecord;
  baseUrl: string;
  apiKey: string;
};

export async function resolveImportSabnzbdClient(userId: string): Promise<ResolvedImportSabnzbdClient> {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");

  if (!connection?.secret || !connection.connection.baseUrl) {
    throw new ImportCompletedDownloadsWorkflowError(
      "sabnzbd_not_connected",
      "Connect SABnzbd before importing completed downloads.",
    );
  }

  if (connection.connection.status !== "verified") {
    throw new ImportCompletedDownloadsWorkflowError(
      "sabnzbd_not_verified",
      connection.connection.statusMessage ?? "Verify SABnzbd before importing completed downloads.",
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
    throw new ImportCompletedDownloadsWorkflowError(
      "download_client_failed",
      "Nooklet could not prepare the SABnzbd download client.",
    );
  }

  return {
    client,
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
  };
}
