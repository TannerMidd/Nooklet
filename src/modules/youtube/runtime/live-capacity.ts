import "server-only";

import { mkdir, stat, statfs } from "node:fs/promises";

import { and, eq, inArray } from "drizzle-orm";

import { ensureDatabaseReady } from "@/lib/database/client";
import {
    engineDownloads,
    mediaLibraries,
    mediaLibraryPaths,
    youtubeDownloads,
} from "@/lib/database/schema";
import { env } from "@/lib/env";

export const YOUTUBE_ADMISSION_HEADROOM_BYTES = 10 * 1024 ** 3;
export const YOUTUBE_FILESYSTEM_SAFETY_BYTES = 1024 ** 3;

export type ActiveYouTubeCapacityForUsenet = {
    activeDownloadCount: number;
    activeDownloadId: string | null;
    engineWorkFutureGrowthBytes: number;
    engineOutputFutureGrowthBytes: number;
};

export type YouTubeCapacityInput = {
    workAvailableBytes: number;
    destinationAvailableBytes: number;
    sameVolume: boolean;
    youtubeHeadroomBytes: number;
    safetyBytes: number;
    usenetWorkspaceReservationBytes: number;
    usenetOutputReservationBytes: number;
    workSharesUsenetWorkspace: boolean;
    destinationSharesUsenetOutput: boolean;
};

export function evaluateYouTubeCapacity(input: YouTubeCapacityInput) {
    const workRequired =
        input.youtubeHeadroomBytes +
        input.safetyBytes +
        (input.workSharesUsenetWorkspace ? input.usenetWorkspaceReservationBytes : 0);
    const destinationRequired =
        input.youtubeHeadroomBytes +
        input.safetyBytes +
        (input.destinationSharesUsenetOutput ? input.usenetOutputReservationBytes : 0);
    const combinedRequired = input.sameVolume
        ? input.youtubeHeadroomBytes * 2 +
          input.safetyBytes +
          (input.workSharesUsenetWorkspace ? input.usenetWorkspaceReservationBytes : 0) +
          (input.destinationSharesUsenetOutput ? input.usenetOutputReservationBytes : 0)
        : null;
    const sufficient = input.sameVolume
        ? input.workAvailableBytes >= (combinedRequired ?? Number.POSITIVE_INFINITY)
        : input.workAvailableBytes >= workRequired &&
          input.destinationAvailableBytes >= destinationRequired;

    return { sufficient, workRequired, destinationRequired, combinedRequired };
}

function availableBytes(value: Awaited<ReturnType<typeof statfs>>) {
    const bytes = Number(value.bavail) * Number(value.bsize);

    return Number.isSafeInteger(bytes) ? bytes : Number.MAX_SAFE_INTEGER;
}

async function deviceId(candidate: string) {
    try {
        return (await stat(candidate)).dev;
    } catch {
        return null;
    }
}

export async function inspectYouTubeLiveCapacity(
    workDirectory: string,
    destinationDirectory: string,
    options: {
        admissionHeadroomBytes?: number;
        safetyBytes?: number;
        statfsFn?: typeof statfs;
        deviceIdFn?: typeof deviceId;
    } = {},
) {
    await mkdir(workDirectory, { recursive: true });
    const statfsFn = options.statfsFn ?? statfs;
    const deviceIdFn = options.deviceIdFn ?? deviceId;
    const activeUsenet = ensureDatabaseReady()
        .select({
            totalBytes: engineDownloads.totalBytes,
            downloadedBytes: engineDownloads.downloadedBytes,
        })
        .from(engineDownloads)
        .where(
            inArray(engineDownloads.state, [
                "queued",
                "fetching",
                "repairing",
                "extracting",
                "paused",
            ]),
        )
        .all();
    const reservations = activeUsenet.reduce(
        (usage, row) => {
            const remaining = Math.max(0, row.totalBytes - row.downloadedBytes);

            usage.workspace += row.totalBytes + remaining;
            usage.output += remaining;

            return usage;
        },
        { workspace: 0, output: 0 },
    );
    const [
        workFs,
        destinationFs,
        workDevice,
        destinationDevice,
        engineWorkDevice,
        engineOutputDevice,
    ] = await Promise.all([
        statfsFn(workDirectory),
        statfsFn(destinationDirectory),
        deviceIdFn(workDirectory),
        deviceIdFn(destinationDirectory),
        deviceIdFn(env.DOWNLOAD_ENGINE_WORK_DIR),
        deviceIdFn(env.DOWNLOAD_ENGINE_DIR),
    ]);

    return evaluateYouTubeCapacity({
        workAvailableBytes: availableBytes(workFs),
        destinationAvailableBytes: availableBytes(destinationFs),
        sameVolume: workDevice !== null && workDevice === destinationDevice,
        youtubeHeadroomBytes: options.admissionHeadroomBytes ?? YOUTUBE_ADMISSION_HEADROOM_BYTES,
        safetyBytes: options.safetyBytes ?? YOUTUBE_FILESYSTEM_SAFETY_BYTES,
        usenetWorkspaceReservationBytes: reservations.workspace,
        usenetOutputReservationBytes: reservations.output,
        workSharesUsenetWorkspace: workDevice !== null && workDevice === engineWorkDevice,
        destinationSharesUsenetOutput:
            destinationDevice !== null && destinationDevice === engineOutputDevice,
    });
}

/**
 * Returns conservative *future growth* the Usenet admission checks must reserve
 * for the currently active YouTube transfer on each engine filesystem. Current
 * bytes are already reflected in statfs free-space readings, so they are not
 * counted twice. An unknown extractor total is treated as 10 GiB.
 */
export async function inspectActiveYouTubeCapacityForUsenet(
    engineWorkDirectory: string,
    engineOutputDirectory: string,
    options: {
        youtubeWorkDirectory?: string;
        unknownTotalBytes?: number;
        deviceIdFn?: typeof deviceId;
    } = {},
): Promise<ActiveYouTubeCapacityForUsenet> {
    const rows = ensureDatabaseReady()
        .select({ download: youtubeDownloads, path: mediaLibraryPaths })
        .from(youtubeDownloads)
        .innerJoin(mediaLibraryPaths, eq(mediaLibraryPaths.id, youtubeDownloads.libraryPathId))
        .innerJoin(mediaLibraries, eq(mediaLibraries.id, mediaLibraryPaths.libraryId))
        .where(
            and(
                inArray(youtubeDownloads.status, ["downloading", "importing"]),
                eq(mediaLibraries.mediaType, "youtube"),
            ),
        )
        .all();
    const deviceIdFn = options.deviceIdFn ?? deviceId;
    const youtubeWorkDirectory = options.youtubeWorkDirectory ?? env.YOUTUBE_WORK_DIR;
    const unknownTotalBytes = options.unknownTotalBytes ?? YOUTUBE_ADMISSION_HEADROOM_BYTES;
    const [engineWorkDevice, engineOutputDevice, youtubeWorkDevice] = await Promise.all([
        deviceIdFn(engineWorkDirectory),
        deviceIdFn(engineOutputDirectory),
        deviceIdFn(youtubeWorkDirectory),
    ]);
    let engineWorkFutureGrowthBytes = 0;
    let engineOutputFutureGrowthBytes = 0;

    for (const { download, path: destination } of rows) {
        const destinationDevice = await deviceIdFn(destination.path);
        const estimatedTotalBytes = Math.max(
            download.totalBytes && download.totalBytes > 0
                ? download.totalBytes
                : unknownTotalBytes,
            download.downloadedBytes,
        );
        const workRemainingBytes =
            download.status === "downloading"
                ? Math.max(0, estimatedTotalBytes - download.downloadedBytes)
                : 0;
        const destinationGrowthBytes = estimatedTotalBytes;

        if (engineWorkDevice !== null && engineWorkDevice === youtubeWorkDevice) {
            engineWorkFutureGrowthBytes += workRemainingBytes;
        }

        if (engineWorkDevice !== null && engineWorkDevice === destinationDevice) {
            engineWorkFutureGrowthBytes += destinationGrowthBytes;
        }

        if (engineOutputDevice !== null && engineOutputDevice === youtubeWorkDevice) {
            engineOutputFutureGrowthBytes += workRemainingBytes;
        }

        if (engineOutputDevice !== null && engineOutputDevice === destinationDevice) {
            engineOutputFutureGrowthBytes += destinationGrowthBytes;
        }
    }

    return {
        activeDownloadCount: rows.length,
        activeDownloadId: rows.length > 0 ? rows[0]!.download.id : null,
        engineWorkFutureGrowthBytes,
        engineOutputFutureGrowthBytes,
    };
}
