import { type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { resolveImportSabnzbdClient } from "../import-completed-downloads/client-resolution";
import { recordDuplicateQueueItemAudit } from "./audit";
import { removeDuplicateSabnzbdQueueItems } from "./duplicate-removal";
import { resolveDuplicateQueueSnapshot } from "./queue-resolution";

export type ReconcileDuplicateSabnzbdQueueItemsInput = {
  queueSnapshot?: SabnzbdQueueSnapshot | null;
};

export async function reconcileDuplicateSabnzbdQueueItemsWorkflow(
  userId: string,
  input: ReconcileDuplicateSabnzbdQueueItemsInput = {},
) {
  const client = await resolveImportSabnzbdClient(userId);
  const snapshot = await resolveDuplicateQueueSnapshot(client, input.queueSnapshot);
  const result = await removeDuplicateSabnzbdQueueItems(userId, client, snapshot);

  await recordDuplicateQueueItemAudit(userId, result);

  return result;
}