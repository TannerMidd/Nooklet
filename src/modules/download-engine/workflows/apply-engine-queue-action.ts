import {
  checkpointDownloadRequestCancellation,
  finalizeDownloadRequestCancellation,
  listActiveRequestsForExternalQueueId,
  listDownloadQueueItemsForRequest,
} from "@/modules/downloads/repositories/download-repository";
import {
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
  listActiveEngineDownloads,
  setEngineDownloadPriority,
  transitionEngineDownloadState,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  ensureEngineRunnerStarted,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
import { type SabnzbdQueueActionInput } from "@/modules/service-connections/sabnzbd-queue-actions";
import {
  checkpointSeasonFulfillmentCancellation,
  rollbackSeasonFulfillmentCancellation,
  type SeasonFulfillmentCancellationCheckpoint,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  renewDownloadRequestWorkLease,
  type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  renewSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";
import { removeAndVerifyEngineItems } from "@/modules/downloads/workflows/verified-engine-removal";

/**
 * Queue controls for the built-in engine, accepting the same action shapes
 * the queue UI already sends. Reordering maps to the priority column; the
 * runner claims by ascending priority.
 */

export class EngineQueueActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineQueueActionError";
  }
}

async function pauseItem(userId: string, itemId: string) {
  const record = await findEngineDownloadById(userId, itemId);

  if (!record) {
    throw new EngineQueueActionError("That download is no longer in the queue.");
  }

  if (record.state === "queued") {
    await transitionEngineDownloadState(userId, itemId, ["queued"], "paused");
    return;
  }

  if (record.state === "fetching") {
    // The runner notices the signal between segments and parks the row.
    signalEngineDownload(itemId, "pause");
  }
}

async function resumeItem(userId: string, itemId: string) {
  clearEngineDownloadSignal(itemId);
  await transitionEngineDownloadState(userId, itemId, ["paused"], "queued");
  await ensureEngineRunnerStarted();
}

async function removeItem(userId: string, itemId: string) {
  const record = await findEngineDownloadById(userId, itemId);

  if (!record) {
    return;
  }

  if (isEngineDownloadPostProcessing(record.state)) {
    throw new EngineQueueActionError(
      "This download is in post-processing. Wait for assembly, repair, or extraction to finish before removing it.",
    );
  }

  const entries = await listActiveRequestsForExternalQueueId(userId, itemId);
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
        throw new Error("Season recovery changed while built-in cleanup was being verified.");
      }
      workLeases.set(fulfillmentId, renewed);
    }
    for (const [requestId, lease] of requestWorkLeases) {
      const renewed = await renewDownloadRequestWorkLease(lease);
      if (!renewed) {
        throw new Error("The download changed while built-in cleanup was being verified.");
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
        throw new EngineQueueActionError(
          "Season recovery is updating this download. Wait a moment and remove it again.",
        );
      }
      workLeases.set(fulfillmentId, lease);
    }
    for (const entry of entries) {
      if (entry.request.fulfillmentId || requestWorkLeases.has(entry.request.id)) continue;
      const lease = await acquireDownloadRequestWorkLease(userId, entry.request.id);
      if (!lease) {
        throw new EngineQueueActionError(
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
      if (queueItems.some((queueItem) => queueItem.externalQueueId !== itemId)) {
        requestsWithSiblingQueueItems.add(requestId);
      }
    }

    // Retry attempts can span SABnzbd and the built-in engine. Only remove the
    // selected engine item here; reconciliation classifies any sibling IDs and
    // sends each one to the correct downloader before finalizing the request.
    const removal = await removeAndVerifyEngineItems(
      userId,
      [itemId],
      { beforeExternalPhase: renewOwnedLeases },
    );
    externalRemoved = [...removal.values()].some((result) => result.externalRemoved === true);
    if (removal.get(itemId)?.removed !== true) {
      throw new EngineQueueActionError(
        removal.get(itemId)?.message
          ?? "Built-in downloader cleanup could not be verified yet.",
      );
    }
    externalRemoved = true;
    await renewOwnedLeases();

    // The linked library request must not stay "queued" forever once its
    // download is gone — close it out with a visible reason.
    for (const [requestId, requestedAt] of requestCancellationCheckpoints) {
      if (requestsWithSiblingQueueItems.has(requestId)) continue;
      const finalized = await finalizeDownloadRequestCancellation({
        userId,
        requestId,
        requestedAt,
      });
      if (!finalized) {
        throw new Error("The download changed before cancellation could be finalized.");
      }
    }

    // Season checkpoints intentionally remain open here. The background
    // reconciler removes any sibling episode jobs and only then terminalizes
    // the durable plan, so a single manual removal cannot strand hidden work.
  } catch (error) {
    if (!externalRemoved) {
      await Promise.allSettled(
        [...cancellationCheckpoints.entries()].map(([fulfillmentId, checkpoint]) => {
          const workLease = workLeases.get(fulfillmentId);
          return workLease
            ? rollbackSeasonFulfillmentCancellation(userId, checkpoint, workLease)
            : Promise.resolve(null);
        }),
      );
    }
    if (requestCancellationCheckpoints.size > 0) {
      const detail = error instanceof Error ? ` ${error.message}` : "";
      throw new EngineQueueActionError(
        `Built-in download cancellation remains pending.${detail} Nooklet will retry cleanup automatically.`,
      );
    }
    throw error;
  } finally {
    await Promise.all([
      ...[...workLeases.values()].map((lease) => releaseSeasonFulfillmentWorkLease(lease)),
      ...[...requestWorkLeases.values()].map((lease) => releaseDownloadRequestWorkLease(lease)),
    ]);
  }
}

async function moveItem(userId: string, itemId: string, direction: "up" | "down") {
  const active = await listActiveEngineDownloads(userId);
  const index = active.findIndex((record) => record.id === itemId);

  if (index === -1) {
    throw new EngineQueueActionError("That download is no longer in the queue.");
  }

  const targetIndex = direction === "up" ? index - 1 : index + 1;

  if (targetIndex < 0 || targetIndex >= active.length) {
    return;
  }

  await reorderToIndex(userId, active.map((record) => record.id), index, targetIndex);
}

async function reorderToIndex(userId: string, orderedIds: string[], fromIndex: number, toIndex: number) {
  const ids = [...orderedIds];
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);

  // Reassign compact priorities matching the new visual order.
  for (let index = 0; index < ids.length; index += 1) {
    await setEngineDownloadPriority(userId, ids[index], index);
  }
}

export async function applyEngineQueueAction(userId: string, action: SabnzbdQueueActionInput) {
  switch (action.type) {
    case "pauseQueue": {
      const active = await listActiveEngineDownloads(userId);

      for (const record of active) {
        await pauseItem(userId, record.id);
      }
      break;
    }
    case "resumeQueue": {
      const active = await listActiveEngineDownloads(userId);

      for (const record of active) {
        if (record.state === "paused") {
          await resumeItem(userId, record.id);
        }
      }
      break;
    }
    case "pause":
      await pauseItem(userId, action.itemId);
      break;
    case "resume":
      await resumeItem(userId, action.itemId);
      break;
    case "remove":
      await removeItem(userId, action.itemId);
      break;
    case "move":
      await moveItem(userId, action.itemId, action.direction);
      break;
    case "moveToIndex": {
      const active = await listActiveEngineDownloads(userId);
      const index = active.findIndex((record) => record.id === action.itemId);

      if (index === -1) {
        throw new EngineQueueActionError("That download is no longer in the queue.");
      }

      await reorderToIndex(
        userId,
        active.map((record) => record.id),
        index,
        Math.min(action.targetIndex, active.length - 1),
      );
      break;
    }
  }
}

/** True when the action's item id belongs to an engine download for the user. */
export async function isEngineQueueItem(userId: string, action: SabnzbdQueueActionInput) {
  if (action.type === "pauseQueue" || action.type === "resumeQueue") {
    return false;
  }

  return Boolean(await findEngineDownloadById(userId, action.itemId));
}
