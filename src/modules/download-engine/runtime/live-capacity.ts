import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import {
  getActiveEngineDownloadCapacityUsage,
} from "@/modules/download-engine/queue/engine-repository";

const minimumFreeSpaceReserveBytes = 512 * 1024 * 1024;

export type LiveEngineCapacity = {
  availableBytes: number;
  requiredBytes: number;
  sufficient: boolean;
};

/**
 * Revalidates capacity inside the isolated worker immediately before a queued
 * release starts. The web process admits against a recent persisted snapshot;
 * this live check closes the gap if capacity changed after that snapshot.
 */
export async function inspectLiveEngineCapacity(): Promise<LiveEngineCapacity> {
  await Promise.all([
    mkdir(env.DOWNLOAD_ENGINE_WORK_DIR, { recursive: true }),
    mkdir(env.DOWNLOAD_ENGINE_DIR, { recursive: true }),
  ]);
  const [workFilesystem, outputFilesystem, usage] = await Promise.all([
    statfs(env.DOWNLOAD_ENGINE_WORK_DIR),
    statfs(env.DOWNLOAD_ENGINE_DIR),
    getActiveEngineDownloadCapacityUsage(),
  ]);
  const workAvailableBytes = workFilesystem.bavail * workFilesystem.bsize;
  const outputAvailableBytes = outputFilesystem.bavail * outputFilesystem.bsize;
  const availableBytes = Math.min(workAvailableBytes, outputAvailableBytes);
  const requiredBytes = minimumFreeSpaceReserveBytes + usage.activeWorkspaceBytes;

  return {
    availableBytes,
    requiredBytes,
    sufficient: Number.isSafeInteger(availableBytes)
      && Number.isSafeInteger(requiredBytes)
      && availableBytes >= requiredBytes,
  };
}
