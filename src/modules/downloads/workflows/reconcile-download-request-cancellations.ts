import {
  deferDownloadRequestCancellation,
  finalizeDownloadRequestCancellation,
  findDownloadRequestById,
  listDownloadQueueItemsForRequest,
  listPendingDownloadRequestCancellations,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
  removeAndVerifyEngineItems,
  type VerifiedEngineRemoval,
} from "@/modules/downloads/workflows/verified-engine-removal";

export type DownloadRequestCancellationReconciliationResult = {
  attemptedCount: number;
  cancelledCount: number;
  pendingCount: number;
  failedCount: number;
};

// Keep one maintenance pass bounded. The durable due window handles the next
// retry instead of letting a large backlog hold imports and recovery.
export const DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT = 3;

async function reconcileRequest(
  request: Awaited<ReturnType<typeof listPendingDownloadRequestCancellations>>[number],
) {
  const lease = await acquireDownloadRequestWorkLease(request.userId, request.id);
  if (!lease) return "pending" as const;

  try {
    const current = await findDownloadRequestById(request.userId, request.id);
    if (
      !current
      || current.fulfillmentId
      || !current.cancellationRequestedAt
      || current.cancellationRequestedAt.getTime()
        !== request.cancellationRequestedAt?.getTime()
    ) {
      return "skipped" as const;
    }
    const requestedAt = current.cancellationRequestedAt;

    let workLease = lease;
    const renew = async () => {
      const renewed = await renewDownloadRequestWorkLease(workLease);
      if (!renewed) {
        throw new Error("Download cancellation ownership expired before cleanup was verified.");
      }
      workLease = renewed;
    };
    const queueItems = await listDownloadQueueItemsForRequest(current.userId, current.id);
    const externalQueueIds = [...new Set(queueItems.map((item) => item.externalQueueId))];
    const removal: Map<string, VerifiedEngineRemoval> = await removeAndVerifyEngineItems(
      current.userId,
      externalQueueIds,
      { beforeExternalPhase: renew },
    );
    const pendingRemoval = externalQueueIds.find((id) => removal.get(id)?.removed !== true);

    if (pendingRemoval) {
      await deferDownloadRequestCancellation({
        userId: current.userId,
        requestId: current.id,
        requestedAt,
        message: removal.get(pendingRemoval)?.message
          ?? "Downloader cleanup is still pending and will retry automatically.",
      });
      return "pending" as const;
    }

    await renew();
    const finalized = await finalizeDownloadRequestCancellation({
      userId: current.userId,
      requestId: current.id,
      requestedAt,
    });
    return finalized ? "cancelled" as const : "skipped" as const;
  } catch (error) {
    if (request.cancellationRequestedAt) {
      await deferDownloadRequestCancellation({
        userId: request.userId,
        requestId: request.id,
        requestedAt: request.cancellationRequestedAt,
        message: error instanceof Error
          ? `Cancellation verification will retry: ${error.message}`
          : "Cancellation verification will retry automatically.",
      }).catch(() => false);
    }
    return "failed" as const;
  } finally {
    await releaseDownloadRequestWorkLease(lease);
  }
}

export async function reconcilePendingDownloadRequestCancellations(
  limit = DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT,
): Promise<DownloadRequestCancellationReconciliationResult> {
  const pending = await listPendingDownloadRequestCancellations(limit);
  const outcomes = await Promise.all(pending.map((request) => reconcileRequest(request)));

  const attemptedCount = pending.length;
  let cancelledCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  for (const result of outcomes) {
    if (result === "cancelled") cancelledCount += 1;
    else if (result === "pending") pendingCount += 1;
    else if (result === "failed") failedCount += 1;
  }

  return { attemptedCount, cancelledCount, pendingCount, failedCount };
}
