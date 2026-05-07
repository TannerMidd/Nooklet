import { importCompletedDownloadsWorkflow } from "@/modules/downloads/workflows/import-completed-downloads";

import { getActiveSabnzbdQueue, type ActiveSabnzbdQueueState } from "./get-active-sabnzbd-queue";

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Completed download reconciliation failed.";
}

export async function refreshSabnzbdQueueActivity(userId: string): Promise<ActiveSabnzbdQueueState> {
  let importErrorMessage: string | null = null;

  try {
    await importCompletedDownloadsWorkflow(userId);
  } catch (error) {
    importErrorMessage = errorMessage(error);
  }

  const queueState = await getActiveSabnzbdQueue(userId);

  if (!importErrorMessage || queueState.connectionStatus !== "verified") {
    return queueState;
  }

  return {
    ...queueState,
    statusMessage: `${queueState.statusMessage} Completed download check failed: ${importErrorMessage}`,
  };
}