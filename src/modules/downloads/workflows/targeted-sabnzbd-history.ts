import {
  listSabnzbdHistory,
  type SabnzbdHistoryItem,
  type SabnzbdHistorySnapshot,
} from "@/lib/integrations/sabnzbd";
import {
  findDownloadRequestById,
  listActiveDownloadRequestsForImport,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";

export type TargetedSabnzbdHistoryClient = {
  client: { id: string };
  baseUrl: string;
  apiKey: string;
};

const maxTargetIdsPerRequest = 50;

function uniqueQueueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

/**
 * Reads history by Nooklet's active SAB job ids instead of relying on a
 * recency window. Batching keeps URLs bounded while still covering every
 * tracked job, even when a busy SAB history has pushed it far down the list.
 */
export async function listTargetedSabnzbdHistory(input: {
  baseUrl: string;
  apiKey: string;
  externalQueueIds: string[];
  batchSize?: number;
  timeoutMs?: number;
}): Promise<SabnzbdHistorySnapshot> {
  const queueIds = uniqueQueueIds(input.externalQueueIds);
  if (queueIds.length === 0) {
    return { items: [], totalHistoryCount: 0 };
  }

  const requestedBatchSize = typeof input.batchSize === "number"
    && Number.isFinite(input.batchSize)
    ? Math.trunc(input.batchSize)
    : maxTargetIdsPerRequest;
  const batchSize = Math.max(
    1,
    Math.min(maxTargetIdsPerRequest, requestedBatchSize),
  );
  const itemById = new Map<string, SabnzbdHistoryItem>();

  for (let offset = 0; offset < queueIds.length; offset += batchSize) {
    const targetIds = queueIds.slice(offset, offset + batchSize);
    const snapshot = await listSabnzbdHistory({
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      limit: targetIds.length,
      nzoIds: targetIds,
      timeoutMs: input.timeoutMs,
    });
    const targetSet = new Set(targetIds);

    for (const item of snapshot.items) {
      if (targetSet.has(item.id)) {
        itemById.set(item.id, item);
      }
    }
  }

  return {
    items: queueIds.flatMap((id) => {
      const item = itemById.get(id);
      return item ? [item] : [];
    }),
    totalHistoryCount: itemById.size,
  };
}

export async function listTrackedSabnzbdHistory(
  userId: string,
  client: TargetedSabnzbdHistoryClient,
  options: {
    batchSize?: number;
    timeoutMs?: number;
    requestId?: string;
  } = {},
) {
  let externalQueueIds: string[];
  if (options.requestId) {
    const request = await findDownloadRequestById(userId, options.requestId);
    const queueItems = request && !request.cancellationRequestedAt
      ? await listDownloadQueueItemsForRequest(userId, request.id)
      : [];
    externalQueueIds = queueItems
      .filter((item) => (item.clientId ?? request?.clientId) === client.client.id)
      .map((item) => item.externalQueueId);
  } else {
    const activeDownloads = await listActiveDownloadRequestsForImport(
      userId,
      client.client.id,
    );
    externalQueueIds = activeDownloads.map((entry) => entry.queueItem.externalQueueId);
  }

  return listTargetedSabnzbdHistory({
    baseUrl: client.baseUrl,
    apiKey: client.apiKey,
    externalQueueIds,
    batchSize: options.batchSize,
    timeoutMs: options.timeoutMs,
  });
}
