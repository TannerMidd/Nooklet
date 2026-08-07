import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import { getInFlightEngineDownloadCapacityUsage } from "@/modules/download-engine/queue/engine-repository";

const minimumFreeSpaceReserveBytes = 512 * 1024 * 1024;
/** Room for the assembled download plus an unpacked copy, as at admission. */
const workspaceMultiplier = 2;

export type LiveEngineCapacity = {
    availableBytes: number;
    requiredBytes: number;
    sufficient: boolean;
};

/**
 * Revalidates capacity inside the isolated worker immediately before a queued
 * release starts. The web process admits against a recent persisted snapshot;
 * this live check closes the gap if capacity changed after that snapshot.
 *
 * The question here is narrower than admission's: not "does everything we have
 * committed still fit", but "can this one download run now". The runner is
 * serial, so in-flight usage is normally zero and this reduces to whether the
 * candidate fits in the free space that exists — which means it can never
 * refuse every download at once the way the queue-wide reservation did.
 */
export async function inspectLiveEngineCapacity(candidate: {
    totalBytes: number;
}): Promise<LiveEngineCapacity> {
    await Promise.all([
        mkdir(env.DOWNLOAD_ENGINE_WORK_DIR, { recursive: true }),
        mkdir(env.DOWNLOAD_ENGINE_DIR, { recursive: true }),
    ]);
    const [workFilesystem, outputFilesystem, usage] = await Promise.all([
        statfs(env.DOWNLOAD_ENGINE_WORK_DIR),
        statfs(env.DOWNLOAD_ENGINE_DIR),
        getInFlightEngineDownloadCapacityUsage(),
    ]);
    const workAvailableBytes = workFilesystem.bavail * workFilesystem.bsize;
    const outputAvailableBytes = outputFilesystem.bavail * outputFilesystem.bsize;
    const availableBytes = Math.min(workAvailableBytes, outputAvailableBytes);
    const candidateBytes =
        Number.isSafeInteger(candidate.totalBytes) && candidate.totalBytes > 0
            ? candidate.totalBytes * workspaceMultiplier
            : 0;
    const requiredBytes =
        minimumFreeSpaceReserveBytes + usage.activeWorkspaceBytes + candidateBytes;

    return {
        availableBytes,
        requiredBytes,
        sufficient:
            Number.isSafeInteger(availableBytes) &&
            Number.isSafeInteger(requiredBytes) &&
            availableBytes >= requiredBytes,
    };
}
