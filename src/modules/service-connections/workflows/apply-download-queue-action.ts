import {
  applyEngineQueueAction,
  type EngineQueueActionOutcome,
  isEngineQueueItem,
} from "@/modules/download-engine/workflows/apply-engine-queue-action";
import { findServiceConnectionByType } from "@/modules/service-connections/queries/find-service-connection-by-type";
import { type SabnzbdQueueActionInput } from "@/modules/service-connections/sabnzbd-queue-actions";

import { applySabnzbdQueueAction } from "./apply-sabnzbd-queue-action";

const appliedOutcome: EngineQueueActionOutcome = {
  status: "applied",
  message: "Download queue updated.",
};

/**
 * Routes queue actions to the owning downloader: engine item ids go to the
 * built-in engine, everything else falls through to SABnzbd. Queue-wide
 * pause/resume applies to both stacks when both are configured.
 */
export async function applyDownloadQueueAction(
  userId: string,
  action: SabnzbdQueueActionInput,
): Promise<EngineQueueActionOutcome> {
  const isQueueWide = action.type === "pauseQueue" || action.type === "resumeQueue";
  const [usenetServer, sabnzbd] = await Promise.all([
    findServiceConnectionByType(userId, "usenet-server"),
    findServiceConnectionByType(userId, "sabnzbd"),
  ]);
  const hasEngine = Boolean(usenetServer?.connection.baseUrl);
  const hasSabnzbd = Boolean(sabnzbd?.connection.baseUrl && sabnzbd.secret);

  if (isQueueWide) {
    let engineOutcome = appliedOutcome;
    if (hasEngine) {
      engineOutcome = await applyEngineQueueAction(userId, action);
    }

    if (hasSabnzbd) {
      try {
        await applySabnzbdQueueAction(userId, action);
      } catch {
        // The engine already applied the queue-wide action; a SABnzbd
        // hiccup should not fail the whole request.
      }
    }

    return engineOutcome;
  }

  if (hasEngine && (await isEngineQueueItem(userId, action))) {
    return applyEngineQueueAction(userId, action);
  }

  await applySabnzbdQueueAction(userId, action);
  return appliedOutcome;
}
