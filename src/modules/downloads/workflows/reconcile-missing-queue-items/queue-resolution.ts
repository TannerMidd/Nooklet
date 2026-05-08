import { listSabnzbdQueue, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { type ResolvedImportSabnzbdClient } from "../import-completed-downloads/client-resolution";

const missingQueueReconciliationLimit = 100;

export async function resolveMissingQueueSnapshot(
  client: ResolvedImportSabnzbdClient,
  snapshot?: SabnzbdQueueSnapshot | null,
) {
  if (snapshot) {
    return snapshot;
  }

  return listSabnzbdQueue({
    baseUrl: client.baseUrl,
    apiKey: client.apiKey,
    limit: missingQueueReconciliationLimit,
    timeoutMs: 20_000,
  });
}