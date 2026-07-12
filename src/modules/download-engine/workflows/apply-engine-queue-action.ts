import { rm } from "node:fs/promises";

import {
  deleteEngineDownload,
  findEngineDownloadById,
  listActiveEngineDownloads,
  setEngineDownloadPriority,
  transitionEngineDownloadState,
} from "@/modules/download-engine/queue/engine-repository";
import {
  clearEngineDownloadSignal,
  engineCompleteDir,
  engineIncompleteDir,
  ensureEngineRunnerStarted,
  signalEngineDownload,
} from "@/modules/download-engine/runtime/engine-runner";
import { type SabnzbdQueueActionInput } from "@/modules/service-connections/sabnzbd-queue-actions";

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

  if (record.state === "fetching") {
    signalEngineDownload(itemId, "cancel");
  }

  await deleteEngineDownload(userId, itemId);
  await rm(engineIncompleteDir(itemId), { recursive: true, force: true }).catch(() => undefined);
  await rm(engineCompleteDir(itemId), { recursive: true, force: true }).catch(() => undefined);
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
