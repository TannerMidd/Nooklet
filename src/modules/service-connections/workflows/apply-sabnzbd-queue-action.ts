import {
  listSabnzbdQueue,
  moveSabnzbdQueueItemToPosition,
  pauseSabnzbdQueue,
  pauseSabnzbdQueueItem,
  resumeSabnzbdQueue,
  resumeSabnzbdQueueItem,
} from "@/lib/integrations/sabnzbd";
import { decryptSecret } from "@/lib/security/secret-box";
import {
  checkpointDownloadRequestCancellation,
  finalizeDownloadRequestCancellation,
  listActiveRequestsForExternalQueueId,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
  type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
  checkpointSeasonFulfillmentCancellation,
  type SeasonFulfillmentCancellationCheckpoint,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifySabnzbdItems } from "@/modules/downloads/workflows/verified-sabnzbd-removal";
import {
  formatSabnzbdQueueActionMessage,
  sabnzbdQueuePageLimit,
  type SabnzbdQueueActionInput,
} from "@/modules/service-connections/sabnzbd-queue-actions";
import { findServiceConnectionByType } from "@/modules/service-connections/repositories/service-connection-repository";

import { type ActiveSabnzbdQueueState } from "./get-active-sabnzbd-queue";

async function getVerifiedSabnzbdContext(userId: string) {
  const connection = await findServiceConnectionByType(userId, "sabnzbd");

  if (!connection?.secret || !connection.connection.baseUrl) {
    throw new Error("Connect SABnzbd before editing the queue.");
  }

  if (connection.connection.status !== "verified") {
    throw new Error(connection.connection.statusMessage ?? "Verify SABnzbd before editing the queue.");
  }

  return {
    baseUrl: connection.connection.baseUrl,
    apiKey: decryptSecret(connection.secret.encryptedValue),
  };
}

function getQueueItemIndexOrThrow(input: {
  itemId: string;
  items: Array<{ id: string }>;
}) {
  const currentIndex = input.items.findIndex((item) => item.id === input.itemId);

  if (currentIndex === -1) {
    throw new Error("That SABnzbd queue item is no longer available.");
  }

  return currentIndex;
}

function getQueueMoveTargetPosition(input: {
  itemId: string;
  direction: "up" | "down";
  items: Array<{ id: string }>;
  totalQueueCount: number;
}) {
  const currentIndex = getQueueItemIndexOrThrow({
    itemId: input.itemId,
    items: input.items,
  });

  if (input.direction === "up") {
    if (currentIndex === 0) {
      throw new Error("That SABnzbd queue item is already at the top.");
    }

    return currentIndex - 1;
  }

  if (currentIndex >= input.totalQueueCount - 1) {
    throw new Error("That SABnzbd queue item is already at the bottom.");
  }

  return currentIndex + 1;
}

function getQueueDirectTargetPosition(input: {
  itemId: string;
  targetIndex: number;
  items: Array<{ id: string }>;
  totalQueueCount: number;
}) {
  const currentIndex = getQueueItemIndexOrThrow({
    itemId: input.itemId,
    items: input.items,
  });

  if (input.targetIndex >= input.totalQueueCount) {
    throw new Error("That SABnzbd queue position is no longer available.");
  }

  if (currentIndex === input.targetIndex) {
    return null;
  }

  return input.targetIndex;
}

export async function applySabnzbdQueueAction(
  userId: string,
  action: SabnzbdQueueActionInput,
): Promise<ActiveSabnzbdQueueState> {
  const context = await getVerifiedSabnzbdContext(userId);

  if (action.type === "pauseQueue") {
    await pauseSabnzbdQueue({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
    });
  } else if (action.type === "resumeQueue") {
    await resumeSabnzbdQueue({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
    });
  } else if (action.type === "move" || action.type === "moveToIndex") {
    const snapshot = await listSabnzbdQueue({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      limit: sabnzbdQueuePageLimit,
    });

    const position =
      action.type === "move"
        ? getQueueMoveTargetPosition({
            itemId: action.itemId,
            direction: action.direction,
            items: snapshot.items,
            totalQueueCount: snapshot.totalQueueCount,
          })
        : getQueueDirectTargetPosition({
            itemId: action.itemId,
            targetIndex: action.targetIndex,
            items: snapshot.items,
            totalQueueCount: snapshot.totalQueueCount,
          });

    if (position === null) {
      return {
        connectionStatus: "verified",
        statusMessage: "Queue order unchanged.",
        snapshot,
      };
    }

    await moveSabnzbdQueueItemToPosition({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
      position,
    });
  } else if (action.type === "pause") {
    await pauseSabnzbdQueueItem({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
    });
  } else if (action.type === "resume") {
    await resumeSabnzbdQueueItem({
      baseUrl: context.baseUrl,
      apiKey: context.apiKey,
      itemId: action.itemId,
    });
  } else {
    const entries = await listActiveRequestsForExternalQueueId(userId, action.itemId);
    const workLeases = new Map<string, SeasonFulfillmentWorkLease>();
    const requestWorkLeases = new Map<string, DownloadRequestWorkLease>();
    const cancellationCheckpoints = new Map<string, SeasonFulfillmentCancellationCheckpoint>();
    const requestCancellationCheckpoints = new Map<string, Date>();
    const requestsWithSiblingQueueItems = new Set<string>();
    let externalRemoved = false;
    const renewOwnedLeases = async () => {
      for (const [fulfillmentId, lease] of workLeases) {
        const renewed = await renewSeasonFulfillmentWorkLease(lease);
        if (!renewed) {
          throw new Error(
            "Season recovery changed while SABnzbd cancellation was being verified.",
          );
        }
        workLeases.set(fulfillmentId, renewed);
      }
      for (const [requestId, lease] of requestWorkLeases) {
        const renewed = await renewDownloadRequestWorkLease(lease);
        if (!renewed) {
          throw new Error(
            "The download changed while SABnzbd cancellation was being verified.",
          );
        }
        requestWorkLeases.set(requestId, renewed);
      }
    };

    try {
      for (const entry of entries) {
        const fulfillmentId = entry.request.fulfillmentId;
        if (!fulfillmentId || workLeases.has(fulfillmentId)) continue;

        const lease = await acquireSeasonFulfillmentWorkLease(userId, fulfillmentId);
        if (!lease) {
          throw new Error(
            "Season recovery is updating this download. Wait a moment and remove it again.",
          );
        }
        workLeases.set(fulfillmentId, lease);
      }
      for (const entry of entries) {
        if (entry.request.fulfillmentId || requestWorkLeases.has(entry.request.id)) continue;

        const lease = await acquireDownloadRequestWorkLease(userId, entry.request.id);
        if (!lease) {
          throw new Error(
            "This download is being imported or recovered. Wait a moment and remove it again.",
          );
        }
        requestWorkLeases.set(entry.request.id, lease);
      }

      for (const entry of entries) {
        const fulfillmentId = entry.request.fulfillmentId;
        if (!fulfillmentId || cancellationCheckpoints.has(fulfillmentId)) continue;
        const workLease = workLeases.get(fulfillmentId);
        if (!workLease) continue;
        const checkpoint = await checkpointSeasonFulfillmentCancellation(
          userId,
          entry.request,
          workLease,
        );
        if (checkpoint) cancellationCheckpoints.set(fulfillmentId, checkpoint);
      }
      for (const entry of entries) {
        if (entry.request.fulfillmentId || requestCancellationCheckpoints.has(entry.request.id)) {
          continue;
        }
        const checkpoint = await checkpointDownloadRequestCancellation({
          userId,
          requestId: entry.request.id,
        });
        if (checkpoint?.cancellationRequestedAt) {
          requestCancellationCheckpoints.set(
            checkpoint.id,
            checkpoint.cancellationRequestedAt,
          );
        }
      }

      for (const requestId of requestCancellationCheckpoints.keys()) {
        const queueItems = await listDownloadQueueItemsForRequest(userId, requestId);
        if (queueItems.some((queueItem) => queueItem.externalQueueId !== action.itemId)) {
          requestsWithSiblingQueueItems.add(requestId);
        }
      }

      // A request may contain retry attempts from different download clients.
      // Remove only the item the user selected here; the durable reconciler
      // classifies and verifies any sibling jobs against their actual client.
      const removal = await removeAndVerifySabnzbdItems(context, [action.itemId], {
        beforeExternalPhase: renewOwnedLeases,
      });
      if (removal.get(action.itemId)?.removed !== true) {
        const unverified = removal.get(action.itemId);
        throw new Error(
          unverified?.message
            ?? "SABnzbd did not confirm that the download and its files were removed.",
        );
      }
      externalRemoved = true;
      await renewOwnedLeases();

      for (const [requestId, requestedAt] of requestCancellationCheckpoints) {
        if (requestsWithSiblingQueueItems.has(requestId)) continue;
        const finalized = await finalizeDownloadRequestCancellation({
          userId,
          requestId,
          requestedAt,
        });
        if (!finalized) {
          throw new Error(
            "The download changed before cancellation could be finalized.",
          );
        }
      }

      // Keep season checkpoints pending. Reconciliation removes sibling
      // episode jobs and verifies the physical queue before closing the plan.
    } catch (error) {
      if (requestCancellationCheckpoints.size > 0) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new Error(
          `SABnzbd cancellation remains pending.${detail} Nooklet will verify the queue automatically.`,
          { cause: error },
        );
      }
      if (!externalRemoved && cancellationCheckpoints.size > 0) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new Error(
          `SABnzbd did not confirm the removal.${detail} Cancellation remains pending and Nooklet will verify the queue automatically.`,
          { cause: error },
        );
      }
      throw error;
    } finally {
      await Promise.all(
        [
          ...[...workLeases.values()].map((lease) => releaseSeasonFulfillmentWorkLease(lease)),
          ...[...requestWorkLeases.values()].map((lease) => releaseDownloadRequestWorkLease(lease)),
        ],
      );
    }
  }

  const snapshot = await listSabnzbdQueue({
    baseUrl: context.baseUrl,
    apiKey: context.apiKey,
    limit: sabnzbdQueuePageLimit,
  });

  return {
    connectionStatus: "verified",
    statusMessage: formatSabnzbdQueueActionMessage(action),
    snapshot,
  };
}
