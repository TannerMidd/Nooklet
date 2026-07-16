import {
  type SabnzbdHistorySnapshot,
  type SabnzbdQueueSnapshot,
} from "@/lib/integrations/sabnzbd";
import {
  listTrackedSabnzbdHistory,
} from "@/modules/downloads/workflows/targeted-sabnzbd-history";

import { resolveImportSabnzbdClient } from "../import-completed-downloads/client-resolution";
import { recordMissingQueueItemAudit } from "./audit";
import { retryMissingSabnzbdQueueItems } from "./missing-queue-retry";
import { resolveMissingQueueSnapshot } from "./queue-resolution";

export type ReconcileMissingSabnzbdQueueItemsInput = {
  queueSnapshot?: SabnzbdQueueSnapshot | null;
  historySnapshot?: SabnzbdHistorySnapshot | null;
};

export async function reconcileMissingSabnzbdQueueItemsWorkflow(
  userId: string,
  input: ReconcileMissingSabnzbdQueueItemsInput = {},
) {
  const client = await resolveImportSabnzbdClient(userId);
  const snapshot = await resolveMissingQueueSnapshot(client, input.queueSnapshot);
  const history = input.historySnapshot
    ?? (await listTrackedSabnzbdHistory(userId, client, {
      timeoutMs: 20_000,
    }));
  const result = await retryMissingSabnzbdQueueItems(userId, client, snapshot, history);

  await recordMissingQueueItemAudit(userId, result);

  return result;
}
