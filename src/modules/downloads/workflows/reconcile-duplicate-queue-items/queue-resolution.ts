import { listSabnzbdQueue, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { type ResolvedImportSabnzbdClient } from "../import-completed-downloads/client-resolution";

const duplicateQueueReconciliationLimit = 100;

export async function resolveDuplicateQueueSnapshot(
  client: ResolvedImportSabnzbdClient,
  snapshot?: SabnzbdQueueSnapshot | null,
) {
  if (snapshot) {
    return snapshot;
  }

  return listSabnzbdQueue({
    baseUrl: client.baseUrl,
    apiKey: client.apiKey,
    limit: duplicateQueueReconciliationLimit,
    timeoutMs: 20_000,
  });
}