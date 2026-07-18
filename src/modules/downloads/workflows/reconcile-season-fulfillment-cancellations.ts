import { rm } from "node:fs/promises";

import { activeDownloadRequestStatuses } from "@/lib/database/schema";
import { decryptSecret } from "@/lib/security/secret-box";
import {
  findDownloadClientById,
  listDownloadRequestsForFulfillment,
  listRequestsForFulfillment,
  updateDownloadQueueItemStatus,
  updateDownloadRequestStatus,
} from "@/modules/downloads/repositories/download-repository";
import {
  findDownloadFulfillmentById,
  listDueCancellationDownloadFulfillments,
  updateDownloadFulfillment,
} from "@/modules/downloads/repositories/season-fulfillment-repository";
import {
  deleteEngineDownload,
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  engineCompleteDir,
  engineIncompleteDir,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";

const openFulfillmentStatuses = ["active", "retry_wait", "partial"] as const;
const activeQueueItemStatuses = ["queued", "downloading", "paused"] as const;
const cancellationRetryDelayMs = 5 * 60_000;
const engineIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FulfillmentQueueEntry =
  Awaited<ReturnType<typeof listRequestsForFulfillment>>[number];

type RemovalCheck = {
  removed: boolean;
  message?: string;
};

async function removeEngineDirectories(externalQueueId: string): Promise<RemovalCheck> {
  try {
    await rm(engineIncompleteDir(externalQueueId), { recursive: true, force: true });
    await rm(engineCompleteDir(externalQueueId), { recursive: true, force: true });
    return { removed: true };
  } catch (error) {
    return {
      removed: false,
      message: error instanceof Error
        ? `The built-in download files could not be removed yet: ${error.message}`
        : "The built-in download files could not be removed yet.",
    };
  }
}

async function resolveEntryClientType(
  userId: string,
  entry: FulfillmentQueueEntry,
) {
  const clientId = entry.queueItem.clientId ?? entry.request.clientId;
  const client = clientId ? await findDownloadClientById(userId, clientId) : null;

  if (client?.clientType) return client.clientType;

  const engineDownload = await findEngineDownloadById(
    userId,
    entry.queueItem.externalQueueId,
  );
  if (engineDownload || engineIdPattern.test(entry.queueItem.externalQueueId)) {
    return "nooklet" as const;
  }

  return "sabnzbd" as const;
}

async function reconcileEngineRemoval(
  userId: string,
  externalQueueId: string,
): Promise<RemovalCheck> {
  const record = await findEngineDownloadById(userId, externalQueueId);
  if (!record) return removeEngineDirectories(externalQueueId);

  if (isEngineDownloadPostProcessing(record.state)) {
    return {
      removed: false,
      message: "The built-in downloader is finishing post-processing; removal will retry automatically.",
    };
  }

  signalEngineDownload(externalQueueId, "cancel");
  const removed = await deleteEngineDownload(userId, externalQueueId);
  if (!removed) {
    clearEngineDownloadSignal(externalQueueId);
    return {
      removed: false,
      message: "The built-in downloader changed state before removal could be verified.",
    };
  }

  return removeEngineDirectories(externalQueueId);
}

async function verifiedSabnzbdContext(userId: string) {
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

async function reconcileSabnzbdRemovals(
  userId: string,
  externalQueueIds: string[],
  beforeExternalPhase: () => Promise<void>,
): Promise<Map<string, RemovalCheck>> {
  const uniqueIds = Array.from(new Set(externalQueueIds));
  const results = new Map<string, RemovalCheck>();
  if (uniqueIds.length === 0) return results;

  const context = await verifiedSabnzbdContext(userId);
  if (!context) {
    for (const id of uniqueIds) {
      results.set(id, {
        removed: false,
        message: "Reconnect and verify SABnzbd so Nooklet can confirm the cancellation.",
      });
    }
    return results;
  }

  const verified = await removeAndVerifySabnzbdItems(context, uniqueIds, {
    beforeExternalPhase,
  });
  for (const [id, result] of verified) {
    results.set(id, result);
  }

  return results;
}

async function deferCancellation(input: {
  userId: string;
  fulfillmentId: string;
  requestedAt: Date;
  message: string;
}) {
  await updateDownloadFulfillment({
    userId: input.userId,
    fulfillmentId: input.fulfillmentId,
    expectedStatuses: [...openFulfillmentStatuses],
    expectedCancellationRequestedAt: input.requestedAt,
    status: "retry_wait",
    nextAttemptAt: new Date(Date.now() + cancellationRetryDelayMs),
    statusMessage: input.message,
    completedAt: null,
  });
}

export async function reconcileSeasonFulfillmentCancellation(
  userId: string,
  fulfillmentId: string,
) {
  const lease = await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId);
  if (!lease) return "busy" as const;
  let workLease: SeasonFulfillmentWorkLease = lease;
  const renewOwnedLease = async () => {
    const renewed = await renewSeasonFulfillmentWorkLease(workLease);
    if (!renewed) {
      throw new Error("Season cancellation lease expired before reconciliation completed.");
    }
    workLease = renewed;
  };

  try {
    const fulfillment = await findDownloadFulfillmentById(userId, fulfillmentId);
    if (
      !fulfillment
      || !fulfillment.cancellationRequestedAt
      || !openFulfillmentStatuses.includes(
        fulfillment.status as (typeof openFulfillmentStatuses)[number],
      )
    ) {
      return "skipped" as const;
    }

    const requestedAt = fulfillment.cancellationRequestedAt;
    const [entries, requests] = await Promise.all([
      listRequestsForFulfillment(userId, fulfillmentId),
      listDownloadRequestsForFulfillment(userId, fulfillmentId),
    ]);
    const engineEntries: FulfillmentQueueEntry[] = [];
    const sabEntries: FulfillmentQueueEntry[] = [];

    for (const entry of entries) {
      await renewOwnedLease();
      if (await resolveEntryClientType(userId, entry) === "nooklet") {
        engineEntries.push(entry);
      } else {
        sabEntries.push(entry);
      }
    }

    const checks = new Map<string, RemovalCheck>();
    for (const entry of engineEntries) {
      await renewOwnedLease();
      checks.set(
        entry.queueItem.externalQueueId,
        await reconcileEngineRemoval(userId, entry.queueItem.externalQueueId),
      );
    }
    const sabChecks = await reconcileSabnzbdRemovals(
      userId,
      sabEntries.map((entry) => entry.queueItem.externalQueueId),
      renewOwnedLease,
    );
    for (const [id, result] of sabChecks) checks.set(id, result);

    const pending = entries.filter((entry) => (
      checks.get(entry.queueItem.externalQueueId)?.removed !== true
    ));
    if (pending.length > 0) {
      const message = pending
        .map((entry) => checks.get(entry.queueItem.externalQueueId)?.message)
        .find((value): value is string => Boolean(value))
        ?? "Cancellation is pending while Nooklet verifies the downloader queue.";
      await renewOwnedLease();
      await deferCancellation({
        userId,
        fulfillmentId,
        requestedAt,
        message,
      });
      return "pending" as const;
    }

    await renewOwnedLease();
    const completedAt = new Date();
    const activeQueueEntries = entries.filter((entry) => (
      activeQueueItemStatuses.includes(
        entry.queueItem.status as (typeof activeQueueItemStatuses)[number],
      )
    ));
    for (const entry of activeQueueEntries) {
      await updateDownloadQueueItemStatus({
        userId,
        queueItemId: entry.queueItem.id,
        status: "failed",
        completedAt,
      });
    }

    const activeRequests = requests.filter((request) => (
      activeDownloadRequestStatuses.includes(
        request.status as (typeof activeDownloadRequestStatuses)[number],
      )
    ));
    for (const request of activeRequests) {
      const queueEntry = entries.find((entry) => entry.request.id === request.id);
      await updateDownloadRequestStatus({
        userId,
        requestId: request.id,
        status: "cancelled",
        externalJobId: queueEntry?.queueItem.externalQueueId ?? request.externalJobId,
        statusMessage: queueEntry
          ? "Removed from the download queue."
          : "Season recovery was cancelled before a download was queued.",
        completedAt,
      });
    }

    await renewOwnedLease();
    const transitioned = await updateDownloadFulfillment({
      userId,
      fulfillmentId,
      expectedStatuses: [...openFulfillmentStatuses],
      expectedCancellationRequestedAt: requestedAt,
      status: "cancelled",
      nextAttemptAt: null,
      cancellationRequestedAt: null,
      statusMessage: "Season recovery was cancelled after every downloader job was removed.",
      completedAt,
    });
    return transitioned ? "cancelled" as const : "skipped" as const;
  } catch (error) {
    const stillOwned = await renewSeasonFulfillmentWorkLease(workLease).catch(() => null);
    if (stillOwned) {
      workLease = stillOwned;
      const current = await findDownloadFulfillmentById(userId, fulfillmentId).catch(() => null);
      if (current?.cancellationRequestedAt) {
        await deferCancellation({
          userId,
          fulfillmentId,
          requestedAt: current.cancellationRequestedAt,
          message: error instanceof Error
            ? `Cancellation verification will retry: ${error.message}`
            : "Cancellation verification will retry after an unexpected error.",
        }).catch(() => undefined);
      }
    }
    return "failed" as const;
  } finally {
    await releaseSeasonFulfillmentWorkLease(workLease);
  }
}

export async function reconcilePendingSeasonFulfillmentCancellations() {
  const due = await listDueCancellationDownloadFulfillments({ limit: 50 });
  let attemptedCount = 0;
  let cancelledCount = 0;
  let pendingCount = 0;
  let failedCount = 0;

  for (const fulfillment of due) {
    attemptedCount += 1;
    const result = await reconcileSeasonFulfillmentCancellation(
      fulfillment.userId,
      fulfillment.id,
    );
    if (result === "cancelled") cancelledCount += 1;
    else if (result === "pending" || result === "busy") pendingCount += 1;
    else if (result === "failed") failedCount += 1;
  }

  return { attemptedCount, cancelledCount, pendingCount, failedCount };
}
