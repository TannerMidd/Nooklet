import { rm } from "node:fs/promises";

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

export type VerifiedEngineRemoval = {
  removed: boolean;
  externalRemoved?: boolean;
  message?: string;
};

async function removeEngineDirectories(downloadId: string): Promise<VerifiedEngineRemoval> {
  try {
    await rm(engineIncompleteDir(downloadId), { recursive: true, force: true });
    await rm(engineCompleteDir(downloadId), { recursive: true, force: true });
    return { removed: true, externalRemoved: true };
  } catch (error) {
    return {
      removed: false,
      externalRemoved: true,
      message: error instanceof Error
        ? `The built-in download files could not be removed yet: ${error.message}`
        : "The built-in download files could not be removed yet.",
    };
  }
}

async function removeEngineItem(
  userId: string,
  downloadId: string,
  beforeExternalPhase: () => Promise<void>,
): Promise<VerifiedEngineRemoval> {
  let externalRemoved = false;
  try {
    await beforeExternalPhase();
    const record = await findEngineDownloadById(userId, downloadId);
    if (record && isEngineDownloadPostProcessing(record.state)) {
      return {
        removed: false,
        externalRemoved: false,
        message: "The built-in downloader is finishing post-processing; removal will retry automatically.",
      };
    }

    // Signal even when the row disappeared: another owner may have deleted a
    // row already claimed by the runner. The signal prevents stale finalization.
    signalEngineDownload(downloadId, "cancel");
    if (record) {
      await beforeExternalPhase();
      const removed = await deleteEngineDownload(userId, downloadId);
      if (!removed) {
        const current = await findEngineDownloadById(userId, downloadId);
        if (current) {
          clearEngineDownloadSignal(downloadId);
          return {
            removed: false,
            externalRemoved: false,
            message: "The built-in downloader changed state before removal could be verified.",
          };
        }
      }
      externalRemoved = true;
    } else {
      externalRemoved = true;
    }

    await beforeExternalPhase();
    return removeEngineDirectories(downloadId);
  } catch (error) {
    if (!externalRemoved) {
      clearEngineDownloadSignal(downloadId);
    }
    return {
      removed: false,
      externalRemoved,
      message: error instanceof Error
        ? `Built-in downloader cleanup will retry: ${error.message}`
        : "Built-in downloader cleanup will retry automatically.",
    };
  }
}

export async function removeAndVerifyEngineItems(
  userId: string,
  externalQueueIds: string[],
  options: {
    beforeExternalPhase?: () => Promise<void>;
  } = {},
) {
  const beforeExternalPhase = options.beforeExternalPhase ?? (async () => undefined);
  const ids = Array.from(new Set(externalQueueIds));
  const result = new Map<string, VerifiedEngineRemoval>();

  for (const id of ids) {
    result.set(id, await removeEngineItem(userId, id, beforeExternalPhase));
  }

  return result;
}
