import {
  checkpointDownloadRequestCancellation,
  listActiveRequestsForExternalQueueId,
} from "@/modules/downloads/public";
import {
  findEngineDownloadById,
  isEngineDownloadPostProcessing,
  listActiveEngineDownloads,
  requestEngineDownloadControl,
  resumePausedEngineDownload,
  setEngineDownloadPriority,
  setEngineDownloadState,
} from "@/modules/download-engine/queue/engine-repository";
import { type DownloadQueueActionInput } from "@/modules/download-engine/queue/download-queue-actions";
import {
  checkpointSeasonFulfillmentCancellation,
  rollbackSeasonFulfillmentCancellation,
  type SeasonFulfillmentCancellationCheckpoint,
} from "@/modules/downloads/workflows/season-fulfillment-cancellation";
import {
  acquireDownloadRequestWorkLease,
  releaseDownloadRequestWorkLease,
  type DownloadRequestWorkLease,
} from "@/modules/downloads/workflows/download-request-work-lease";
import {
  acquireSeasonFulfillmentWorkLease,
  releaseSeasonFulfillmentWorkLease,
  type SeasonFulfillmentWorkLease,
} from "@/modules/downloads/workflows/season-fulfillment-work-lease";

/** Queue mutations persist intent only; the isolated worker owns all I/O. */
export type EngineQueueActionOutcome = {
  status: "applied" | "pending";
  message: string;
};

const appliedOutcome: EngineQueueActionOutcome = {
  status: "applied",
  message: "Download queue updated.",
};

export class EngineQueueActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngineQueueActionError";
  }
}

async function pauseItem(userId: string, itemId: string): Promise<EngineQueueActionOutcome> {
  const record = await findEngineDownloadById(userId, itemId);

  if (!record) {
    throw new EngineQueueActionError("That download is no longer in the queue.");
  }
  if (record.controlIntent === "cancel") {
    throw new EngineQueueActionError("That download is already being cancelled.");
  }
  if (record.state === "paused") return appliedOutcome;

  if (record.state === "queued") {
    const paused = await setEngineDownloadState(
      itemId,
      "paused",
      {},
      { expectedStates: ["queued"], controlIntent: null },
    );
    if (!paused) {
      throw new EngineQueueActionError("The download changed before it could be paused.");
    }
    return appliedOutcome;
  }

  if (record.state === "fetching") {
    const requested = await requestEngineDownloadControl(userId, itemId, "pause");
    if (!requested) {
      throw new EngineQueueActionError("The download changed before it could be paused.");
    }
    return {
      status: "pending",
      message: "Pause requested. The downloader will stop safely between segments.",
    };
  }

  if (isEngineDownloadPostProcessing(record.state)) {
    throw new EngineQueueActionError(
      "This download is finishing post-processing and cannot be paused right now.",
    );
  }

  throw new EngineQueueActionError("That download is no longer active.");
}

async function resumeItem(userId: string, itemId: string): Promise<EngineQueueActionOutcome> {
  const resumed = await resumePausedEngineDownload(userId, itemId);
  if (resumed) return appliedOutcome;

  const record = await findEngineDownloadById(userId, itemId);
  if (record?.controlIntent === "cancel") {
    throw new EngineQueueActionError("That download is already being cancelled.");
  }
  throw new EngineQueueActionError("That download is no longer paused.");
}

async function removeItem(userId: string, itemId: string): Promise<EngineQueueActionOutcome> {
  const record = await findEngineDownloadById(userId, itemId);
  if (!record) return appliedOutcome;

  const entries = await listActiveRequestsForExternalQueueId(userId, itemId);
  const workLeases = new Map<string, SeasonFulfillmentWorkLease>();
  const requestWorkLeases = new Map<string, DownloadRequestWorkLease>();
  const cancellationCheckpoints = new Map<string, SeasonFulfillmentCancellationCheckpoint>();
  let requestCancellationCheckpointed = false;
  let controlRequested = record.controlIntent === "cancel";

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
      if (entry.request.fulfillmentId) continue;
      const checkpoint = await checkpointDownloadRequestCancellation({
        userId,
        requestId: entry.request.id,
      });
      requestCancellationCheckpointed ||= Boolean(checkpoint?.cancellationRequestedAt);
    }

    const requested = await requestEngineDownloadControl(userId, itemId, "cancel");
    if (!requested) {
      const current = await findEngineDownloadById(userId, itemId);
      if (current) {
        throw new Error("The download changed before cancellation could be recorded.");
      }
      return appliedOutcome;
    }
    controlRequested = true;

    return {
      status: "pending",
      message:
        "Cancellation requested. The isolated downloader is removing its files; the item will disappear after cleanup is verified.",
    };
  } catch (error) {
    if (!controlRequested) {
      await Promise.allSettled(
        [...cancellationCheckpoints.entries()].map(([fulfillmentId, checkpoint]) => {
          const workLease = workLeases.get(fulfillmentId);
          return workLease
            ? rollbackSeasonFulfillmentCancellation(userId, checkpoint, workLease)
            : Promise.resolve(null);
        }),
      );
    }

    if (controlRequested || requestCancellationCheckpointed) {
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
  if (targetIndex < 0 || targetIndex >= active.length) return;

  await reorderToIndex(userId, active.map((record) => record.id), index, targetIndex);
}

async function reorderToIndex(userId: string, orderedIds: string[], fromIndex: number, toIndex: number) {
  const ids = [...orderedIds];
  const [moved] = ids.splice(fromIndex, 1);
  ids.splice(toIndex, 0, moved);

  for (let index = 0; index < ids.length; index += 1) {
    await setEngineDownloadPriority(userId, ids[index], index);
  }
}

export async function applyEngineQueueAction(
  userId: string,
  action: DownloadQueueActionInput,
): Promise<EngineQueueActionOutcome> {
  switch (action.type) {
    case "pauseQueue": {
      const active = await listActiveEngineDownloads(userId);
      let pending = false;
      for (const record of active) {
        const outcome = await pauseItem(userId, record.id);
        pending ||= outcome.status === "pending";
      }
      return pending
        ? { status: "pending", message: "Pause requested for active downloads." }
        : appliedOutcome;
    }
    case "resumeQueue": {
      const active = await listActiveEngineDownloads(userId);
      for (const record of active) {
        if (record.state === "paused" && record.controlIntent !== "cancel") {
          await resumeItem(userId, record.id);
        }
      }
      return appliedOutcome;
    }
    case "pause":
      return pauseItem(userId, action.itemId);
    case "resume":
      return resumeItem(userId, action.itemId);
    case "remove":
      return removeItem(userId, action.itemId);
    case "move":
      await moveItem(userId, action.itemId, action.direction);
      return appliedOutcome;
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
      return appliedOutcome;
    }
  }
}
