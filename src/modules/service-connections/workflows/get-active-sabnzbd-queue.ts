import { decryptSecret } from "@/lib/security/secret-box";
import { listSabnzbdQueue, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";
import { sabnzbdQueuePageLimit } from "@/modules/service-connections/sabnzbd-queue-actions";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

export type ActiveSabnzbdQueueState = {
  connectionStatus: "disconnected" | "configured" | "verified" | "error";
  statusMessage: string;
  snapshot: SabnzbdQueueSnapshot | null;
};

export async function getActiveSabnzbdQueue(userId: string): Promise<ActiveSabnzbdQueueState> {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");

  if (!connection?.secret || !connection.connection.baseUrl) {
    return {
      connectionStatus: "disconnected",
      statusMessage: "Connect SABnzbd to track active request progress.",
      snapshot: null,
    };
  }

  if (connection.connection.status !== "verified") {
    return {
      connectionStatus: connection.connection.status,
      statusMessage:
        connection.connection.statusMessage ?? "Verify SABnzbd to track active request progress.",
      snapshot: null,
    };
  }

  try {
    const snapshot = await listSabnzbdQueue({
      baseUrl: connection.connection.baseUrl,
      apiKey: decryptSecret(connection.secret.encryptedValue),
      limit: sabnzbdQueuePageLimit,
    });

    return {
      connectionStatus: "verified",
      statusMessage:
        snapshot.activeQueueCount > 0
          ? `${snapshot.activeQueueCount} active SABnzbd request${snapshot.activeQueueCount === 1 ? "" : "s"}.`
          : "No active SABnzbd requests right now.",
      snapshot,
    };
  } catch (error) {
    return {
      connectionStatus: "error",
      statusMessage:
        error instanceof Error
          ? error.message
          : "Unable to load active SABnzbd requests right now.",
      snapshot: null,
    };
  }
}