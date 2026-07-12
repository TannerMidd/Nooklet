import { decryptSecret } from "@/lib/security/secret-box";
import {
  createDownloadClient,
  findDownloadClientByServiceConnectionId,
} from "@/modules/downloads/repositories/download-repository";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { QueueIndexerResultWorkflowError } from "./errors";

type DownloadClientRecord = NonNullable<Awaited<ReturnType<typeof findDownloadClientByServiceConnectionId>>>;

export type ResolvedDownloadClient =
  | {
      kind: "nooklet";
      client: DownloadClientRecord;
    }
  | {
      kind: "sabnzbd";
      client: DownloadClientRecord;
      baseUrl: string;
      apiKey: string;
    };

async function ensureClientRecord(input: {
  userId: string;
  serviceConnectionId: string;
  clientType: "nooklet" | "sabnzbd";
  displayName: string;
}): Promise<DownloadClientRecord> {
  const existingClient = await findDownloadClientByServiceConnectionId(
    input.userId,
    input.serviceConnectionId,
  );
  const client = existingClient ?? await createDownloadClient({
    userId: input.userId,
    serviceConnectionId: input.serviceConnectionId,
    clientType: input.clientType,
    displayName: input.displayName,
    status: "verified",
    isDefault: input.clientType === "nooklet",
  });

  if (!client) {
    throw new QueueIndexerResultWorkflowError(
      "download_request_failed",
      "Nooklet could not prepare the download client.",
    );
  }

  return client;
}

/**
 * Resolves where queued releases download to. The built-in engine (a
 * configured usenet server) is the default; SABnzbd remains a legacy
 * fallback for users who have not added a usenet server yet.
 */
export async function resolveDownloadClient(userId: string): Promise<ResolvedDownloadClient> {
  const usenetServer = await findServiceConnectionByType(userId, "usenet-server");

  if (usenetServer?.connection.baseUrl) {
    if (usenetServer.connection.status !== "verified") {
      throw new QueueIndexerResultWorkflowError(
        "sabnzbd_not_verified",
        usenetServer.connection.statusMessage ?? "Verify the usenet server before queueing releases.",
      );
    }

    const client = await ensureClientRecord({
      userId,
      serviceConnectionId: usenetServer.connection.id,
      clientType: "nooklet",
      displayName: "Nooklet downloader",
    });

    return { kind: "nooklet", client };
  }

  const sabnzbd = await findServiceConnectionByType(userId, "sabnzbd");

  if (!sabnzbd?.secret || !sabnzbd.connection.baseUrl) {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_not_connected",
      "Add a usenet server under Settings → Connections before queueing releases.",
    );
  }

  if (sabnzbd.connection.status !== "verified") {
    throw new QueueIndexerResultWorkflowError(
      "sabnzbd_not_verified",
      sabnzbd.connection.statusMessage ?? "Verify SABnzbd before queueing releases.",
    );
  }

  const client = await ensureClientRecord({
    userId,
    serviceConnectionId: sabnzbd.connection.id,
    clientType: "sabnzbd",
    displayName: sabnzbd.connection.displayName,
  });

  return {
    kind: "sabnzbd",
    client,
    baseUrl: sabnzbd.connection.baseUrl,
    apiKey: decryptSecret(sabnzbd.secret.encryptedValue),
  };
}
