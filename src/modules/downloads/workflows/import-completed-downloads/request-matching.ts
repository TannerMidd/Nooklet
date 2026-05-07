import {
  listActiveDownloadRequestsForImport,
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
): Promise<MatchedCompletedDownload[]> {
  const activeRequests = await listActiveDownloadRequestsForImport(userId, client.client.id);
  const activeRequestByQueueId = new Map(
    activeRequests.map((entry) => [entry.queueItem.externalQueueId, entry]),
  );

  return history.items.flatMap((historyItem) => {
    const activeRequest = activeRequestByQueueId.get(historyItem.id);

    return activeRequest ? [{ ...activeRequest, historyItem }] : [];
  });
}
