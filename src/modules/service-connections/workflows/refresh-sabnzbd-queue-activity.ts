import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";
import { reconcileDuplicateSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-duplicate-queue-items";
import { reconcileMissingSabnzbdQueueItemsWorkflow } from "@/modules/downloads/workflows/reconcile-missing-queue-items";

import { getActiveSabnzbdQueue, type ActiveSabnzbdQueueState } from "./get-active-sabnzbd-queue";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Completed download reconciliation failed.";
}

export async function refreshSabnzbdQueueActivity(userId: string): Promise<ActiveSabnzbdQueueState> {
  let importErrorMessage: string | null = null;
  let queueState = await getActiveSabnzbdQueue(userId);

  try {
    await importCompletedDownloadsWorkflow(userId);
    if (queueState.connectionStatus === "verified") {
      await reconcileMissingSabnzbdQueueItemsWorkflow(userId, {
        queueSnapshot: queueState.snapshot,
      });
      const duplicateResult = await reconcileDuplicateSabnzbdQueueItemsWorkflow(userId, {
        queueSnapshot: queueState.snapshot,
      });

      if (duplicateResult.removedCount > 0) {
        queueState = await getActiveSabnzbdQueue(userId);
      }
    }
  } catch (error) {
    importErrorMessage = errorMessage(error);
  }

  if (!importErrorMessage || queueState.connectionStatus !== "verified") {
    return queueState;
  }

  return {
    ...queueState,
    statusMessage: `${queueState.statusMessage} Completed download check failed: ${importErrorMessage}`,
  };
}