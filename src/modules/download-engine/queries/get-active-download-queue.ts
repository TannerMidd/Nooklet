import "server-only";

import { getEngineQueueSnapshot } from "@/modules/download-engine/queries/get-engine-queue-snapshot";
import { type ActiveDownloadQueueState } from "@/modules/download-engine/queue/download-queue";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

export async function getActiveDownloadQueue(
  userId: string,
): Promise<ActiveDownloadQueueState> {
  const usenetServer = await findServiceConnectionByType(userId, "usenet-server");

  if (!usenetServer?.connection.baseUrl) {
    return {
      connectionStatus: "disconnected",
      statusMessage:
        "Add a Usenet server under Settings → Connections to download releases.",
      snapshot: null,
    };
  }

  if (usenetServer.connection.status !== "verified") {
    return {
      connectionStatus: usenetServer.connection.status,
      statusMessage:
        usenetServer.connection.statusMessage
        ?? "Verify the Usenet server before downloading releases.",
      snapshot: null,
    };
  }

  const snapshot = await getEngineQueueSnapshot(userId);
  return {
    connectionStatus: "verified",
    statusMessage: snapshot.activeQueueCount > 0
      ? `${snapshot.activeQueueCount} active download${snapshot.activeQueueCount === 1 ? "" : "s"}.`
      : "No active downloads right now.",
    snapshot,
  };
}
