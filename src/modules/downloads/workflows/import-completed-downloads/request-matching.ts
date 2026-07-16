import {
  findDownloadRequestById,
  listActiveDownloadRequestsForImport,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";

import { type ResolvedImportSabnzbdClient } from "./client-resolution";
import { type FinishedSabnzbdHistoryItem, type FinishedSabnzbdHistory } from "./history-fetch";

type ActiveDownloadRequest = Awaited<ReturnType<typeof listActiveDownloadRequestsForImport>>[number];

export type MatchedCompletedDownload = ActiveDownloadRequest & {
  historyItem: FinishedSabnzbdHistoryItem;
};

export async function matchFinishedHistoryToDownloads(
  userId: string,
  client: ResolvedImportSabnzbdClient,
  history: FinishedSabnzbdHistory,
  options: {
    requestId?: string;
  } = {},
): Promise<MatchedCompletedDownload[]> {
  if (options.requestId) {
    const request = await findDownloadRequestById(userId, options.requestId);
    if (
      !request
      || request.cancellationRequestedAt
    ) {
      return [];
    }
    const queueItems = await listDownloadQueueItemsForRequest(userId, request.id);
    const queueItemByExternalId = new Map(
      queueItems
        .filter((queueItem) => (
          (queueItem.clientId ?? request.clientId) === client.client.id
        ))
        .map((queueItem) => [queueItem.externalQueueId, queueItem]),
    );

    return history.items.flatMap((historyItem) => {
      const queueItem = queueItemByExternalId.get(historyItem.id);
      return queueItem ? [{ request, queueItem, historyItem }] : [];
    });
  }

  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.client.id);
  const activeRequestByQueueId = new Map(
    activeRequests.map((entry) => [entry.queueItem.externalQueueId, entry]),
  );

  return history.items.flatMap((historyItem) => {
    const activeRequest = activeRequestByQueueId.get(historyItem.id);

    return activeRequest ? [{ ...activeRequest, historyItem }] : [];
  });
}
