import { importCompletedEngineDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-engine-downloads";
import { getEngineQueueSnapshot } from "@/modules/download-engine/queries/get-engine-queue-snapshot";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";

import { type ActiveSabnzbdQueueState } from "./get-active-sabnzbd-queue";
import { refreshSabnzbdQueueActivity } from "./refresh-sabnzbd-queue-activity";

/**
 * Unified download-queue view: the built-in engine is the primary source,
 * with legacy SABnzbd items merged in while both are configured. Returns the
 * snapshot shape the queue UI already renders.
 */
export async function getActiveDownloadQueue(userId: string): Promise<ActiveSabnzbdQueueState> {
  const [usenetServer, sabnzbd] = await Promise.all([
    findServiceConnectionByType(userId, "usenet-server"),
    findServiceConnectionByType(userId, "sabnzbd"),
  ]);

  const hasEngine = Boolean(usenetServer?.connection.baseUrl);
  const hasSabnzbd = Boolean(sabnzbd?.connection.baseUrl && sabnzbd.secret);

  if (!hasEngine && !hasSabnzbd) {
    return {
      connectionStatus: "disconnected",
      statusMessage:
        "Add a usenet server under Settings → Connections to download releases with the built-in engine.",
      snapshot: null,
    };
  }

  let engineState: ActiveSabnzbdQueueState | null = null;

  if (hasEngine) {
    // Opportunistic housekeeping, mirroring the SABnzbd refresh semantics:
    // make sure the drain loop is alive and finished downloads get imported.
    await ensureEngineRunnerStarted();

    try {
      await importCompletedEngineDownloadsWorkflow(userId);
    } catch {
      // Imports retry on the next worker tick.
    }

    const snapshot = await getEngineQueueSnapshot(userId);

    engineState = {
      connectionStatus: usenetServer!.connection.status === "error" ? "error" : "verified",
      statusMessage:
        snapshot.activeQueueCount > 0
          ? `${snapshot.activeQueueCount} active download${snapshot.activeQueueCount === 1 ? "" : "s"}.`
          : "No active downloads right now.",
      snapshot,
    };
  }

  const sabnzbdState = hasSabnzbd ? await refreshSabnzbdQueueActivity(userId) : null;

  if (!engineState) {
    return sabnzbdState!;
  }

  if (!sabnzbdState?.snapshot || sabnzbdState.snapshot.totalQueueCount === 0) {
    return engineState;
  }

  // Both stacks have items during the migration window — merge them.
  const engineSnapshot = engineState.snapshot!;
  const sabnzbdSnapshot = sabnzbdState.snapshot;

  return {
    connectionStatus: "verified",
    statusMessage: `${engineSnapshot.activeQueueCount + sabnzbdSnapshot.activeQueueCount} active downloads (built-in + SABnzbd).`,
    snapshot: {
      ...engineSnapshot,
      speed: engineSnapshot.speed ?? sabnzbdSnapshot.speed,
      kbPerSec: engineSnapshot.kbPerSec ?? sabnzbdSnapshot.kbPerSec,
      timeLeft: engineSnapshot.timeLeft ?? sabnzbdSnapshot.timeLeft,
      paused: engineSnapshot.paused && sabnzbdSnapshot.paused,
      activeQueueCount: engineSnapshot.activeQueueCount + sabnzbdSnapshot.activeQueueCount,
      totalQueueCount: engineSnapshot.totalQueueCount + sabnzbdSnapshot.totalQueueCount,
      items: [...engineSnapshot.items, ...sabnzbdSnapshot.items],
    },
  };
}
