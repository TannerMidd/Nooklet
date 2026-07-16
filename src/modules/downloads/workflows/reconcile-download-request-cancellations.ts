import { decryptSecret } from "@/lib/security/secret-box";
import {
  deferDownloadRequestCancellation,
  findDownloadClientById,
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
  findEngineDownloadById,
} from "@/modules/download-engine/queue/engine-repository";
import {
  removeAndVerifyEngineItems,
  type VerifiedEngineRemoval,
} from "@/modules/downloads/workflows/verified-engine-removal";
import {
  removeAndVerifySabnzbdItems,
  type SabnzbdRemovalContext,
} from "@/modules/downloads/workflows/verified-sabnzbd-removal";
import {
  findServiceConnectionByType,
} from "@/modules/service-connections/repositories/service-connection-repository";

export type DownloadRequestCancellationReconciliationResult = {
  attemptedCount: number;
  cancelledCount: number;
  pendingCount: number;
  failedCount: number;
};

const reconnectMessage =
  "Reconnect and verify SABnzbd so Nooklet can finish cancelling this download.";
// Keep one maintenance pass bounded by roughly one downloader timeout. The
// durable due window handles the next retry instead of letting a large backlog
// hold imports and recovery behind sequential network timeouts.
export const DOWNLOAD_REQUEST_CANCELLATION_PASS_LIMIT = 3;
const engineIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveQueueClientType(
  userId: string,
  requestClientId: string | null,
  queueItem: Awaited<ReturnType<typeof listDownloadQueueItemsForRequest>>[number],
) {
  const clientId = queueItem.clientId ?? requestClientId;
  const client = clientId ? await findDownloadClientById(userId, clientId) : null;
  if (client?.clientType) return client.clientType;

  const engineDownload = await findEngineDownloadById(userId, queueItem.externalQueueId);
  return engineDownload || engineIdPattern.test(queueItem.externalQueueId)
    ? "nooklet" as const
    : "sabnzbd" as const;
}

async function verifiedSabnzbdContext(userId: string): Promise<SabnzbdRemovalContext | null> {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");
  if (
    !connection?.secret
    || !connection.connection.baseUrl
    || connection.connection.status !== "verified"
  ) {
    return null;
  }

  return {
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
  };
}

async function reconcileRequest(
  request: Awaited<ReturnType<typeof listPendingDownloadRequestCancellations>>[number],
  context: SabnzbdRemovalContext | null,
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
    const engineIds: string[] = [];
    const sabnzbdIds: string[] = [];
    for (const queueItem of queueItems) {
      await renew();
      if (
        await resolveQueueClientType(current.userId, current.clientId, queueItem)
        === "nooklet"
      ) {
        engineIds.push(queueItem.externalQueueId);
      } else {
        sabnzbdIds.push(queueItem.externalQueueId);
      }
    }
    const removal = new Map<string, VerifiedEngineRemoval>();
    const engineRemoval = await removeAndVerifyEngineItems(
      current.userId,
      engineIds,
      { beforeExternalPhase: renew },
    );
    for (const [id, result] of engineRemoval) removal.set(id, result);
    if (sabnzbdIds.length > 0) {
      if (context) {
        const sabnzbdRemoval = await removeAndVerifySabnzbdItems(context, sabnzbdIds, {
          beforeExternalPhase: renew,
        });
        for (const [id, result] of sabnzbdRemoval) removal.set(id, result);
      } else {
        for (const id of sabnzbdIds) {
          removal.set(id, { removed: false, message: reconnectMessage });
        }
      }
    }
    const externalQueueIds = [...new Set([...engineIds, ...sabnzbdIds])];
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
  const contextByUserId = new Map<string, Promise<SabnzbdRemovalContext | null>>();
  const outcomes = await Promise.all(pending.map(async (request) => {
    let contextPromise = contextByUserId.get(request.userId);
    if (!contextPromise) {
      contextPromise = verifiedSabnzbdContext(request.userId);
      contextByUserId.set(request.userId, contextPromise);
    }

    let context: SabnzbdRemovalContext | null;
    try {
      context = await contextPromise;
    } catch {
      context = null;
    }
    return reconcileRequest(request, context);
  }));

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
