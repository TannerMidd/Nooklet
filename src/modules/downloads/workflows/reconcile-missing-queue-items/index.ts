import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { resolveImportSabnzbdClient } from "../import-completed-downloads/client-resolution";
import { recordMissingQueueItemAudit } from "./audit";
import { retryMissingSabnzbdQueueItems } from "./missing-queue-retry";
import { resolveMissingQueueSnapshot } from "./queue-resolution";

export type ReconcileMissingSabnzbdQueueItemsInput = {
  queueSnapshot?: SabnzbdQueueSnapshot | null;
};

export async function reconcileMissingSabnzbdQueueItemsWorkflow(
  userId: string,
  input: ReconcileMissingSabnzbdQueueItemsInput = {},
) {
  const client = await resolveImportSabnzbdClient(userId);
  const snapshot = await resolveMissingQueueSnapshot(client, input.queueSnapshot);
  const result = await retryMissingSabnzbdQueueItems(userId, client, snapshot);

  await recordMissingQueueItemAudit(userId, result);

  return result;
}