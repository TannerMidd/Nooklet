import { listAllSabnzbdQueueItems, type SabnzbdQueueSnapshot } from "@/lib/integrations/sabnzbd";

import { type ResolvedImportSabnzbdClient } from "../import-completed-downloads/client-resolution";

export async function resolveMissingQueueSnapshot(
  client: ResolvedImportSabnzbdClient,
  snapshot?: SabnzbdQueueSnapshot | null,
) {
  if (snapshot) {
    return snapshot;
  }

  return listAllSabnzbdQueueItems({
    baseUrl: client.baseUrl,
    apiKey: client.apiKey,
    pageSize: 100,
    timeoutMs: 20_000,
  });
}