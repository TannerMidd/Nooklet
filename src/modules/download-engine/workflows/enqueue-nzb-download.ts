import path from "node:path";

import { env } from "@/lib/env";
import { NzbParseError, parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { createEngineDownloadWithCapacityReservation } from "@/modules/download-engine/queue/engine-repository";
import { type EngineDownloadCategory } from "@/lib/database/schema";
import {
    downloadEngineWorkSnapshotId,
    downloadWorkspaceSnapshotId,
    findStorageSnapshot,
} from "@/modules/storage/public";
import { getStorageSnapshotStatus } from "@/modules/storage/storage-snapshot-status";
import { inspectActiveYouTubeCapacityForUsenet } from "@/modules/youtube/public";

export type EnqueueNzbDownloadErrorCode =
    "invalid_nzb" | "insufficient_space" | "storage_unavailable";

export type EnqueueNzbDownloadCapacity = {
    availableBytes: number;
    filesystemCapacityBytes: number;
    requiredBytes: number;
    activeReservationBytes: number;
    activeRemainingBytes: number;
    activeDownloadedBytes: number;
};

export class EnqueueNzbDownloadError extends Error {
    constructor(
        public readonly code: EnqueueNzbDownloadErrorCode,
        message: string,
        public readonly capacity: EnqueueNzbDownloadCapacity | null = null,
    ) {
        super(message);
        this.name = "EnqueueNzbDownloadError";
    }
}

export type EnqueuedNzbDownload = {
    id: string;
    name: string;
    totalBytes: number;
    totalSegments: number;
};

const minimumFreeSpaceReserveBytes = 512 * 1024 * 1024;

function pathVolumeIdentity(candidate: string) {
    const root = path.parse(path.resolve(candidate)).root.toLocaleLowerCase();
    let hash = 2_166_136_261;

    for (const character of root) {
        hash ^= character.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 16_777_619);
    }

    return hash >>> 0;
}

function formatCapacity(bytes: number) {
    if (bytes >= 1024 ** 3) {
        return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
    }

    return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

async function readDownloadCapacity() {
    // Bind-mount probes run only in the isolated storage worker. The request
    // path admits against its recent durable snapshot; the engine revalidates
    // both work and output filesystems immediately before claiming work.
    const workPath = path.resolve(env.DOWNLOAD_ENGINE_WORK_DIR);
    const outputPath = path.resolve(env.DOWNLOAD_ENGINE_DIR);
    const [workSnapshot, outputSnapshot] = await Promise.all([
        findStorageSnapshot(downloadEngineWorkSnapshotId),
        findStorageSnapshot(downloadWorkspaceSnapshotId),
    ]);
    const snapshots = [
        { label: "work", path: workPath, snapshot: workSnapshot },
        { label: "output", path: outputPath, snapshot: outputSnapshot },
    ].map((entry) => ({
        ...entry,
        status: getStorageSnapshotStatus(entry.snapshot, entry.path),
    }));
    const unavailable = snapshots.find(
        ({ snapshot, status }) =>
            status !== "fresh" ||
            !snapshot?.reachable ||
            !snapshot.writable ||
            snapshot.freeSpaceBytes === null ||
            snapshot.totalSpaceBytes === null,
    );

    if (unavailable) {
        const detail =
            unavailable.status === "stale"
                ? `The latest ${unavailable.label} storage check is stale.`
                : unavailable.status === "error"
                  ? `The ${unavailable.label} workspace is not reachable and writable.`
                  : `The ${unavailable.label} workspace has not been checked yet.`;

        throw new EnqueueNzbDownloadError(
            "storage_unavailable",
            `${detail} Wait for the isolated storage check, then try again.`,
        );
    }

    const work = workSnapshot!;
    const output = outputSnapshot!;
    const youtubeUsage = await inspectActiveYouTubeCapacityForUsenet(workPath, outputPath, {
        // Admission stays free of mount I/O: compare canonical drive/root names
        // conservatively here, then let the isolated runner perform exact
        // device-id checks immediately before claiming the download.
        deviceIdFn: async (candidate) => pathVolumeIdentity(candidate),
    });
    const workAvailableBytes = Math.max(
        0,
        work.freeSpaceBytes! - youtubeUsage.engineWorkFutureGrowthBytes,
    );
    const outputAvailableBytes = Math.max(
        0,
        output.freeSpaceBytes! - youtubeUsage.engineOutputFutureGrowthBytes,
    );
    const constrained =
        workAvailableBytes <= outputAvailableBytes
            ? { snapshot: work, directory: workPath, availableBytes: workAvailableBytes }
            : { snapshot: output, directory: outputPath, availableBytes: outputAvailableBytes };

    return {
        availableBytes: constrained.availableBytes,
        filesystemCapacityBytes: constrained.snapshot.totalSpaceBytes!,
        constrainedDirectory: constrained.directory,
    };
}

/**
 * Accepts NZB XML into the engine queue: parse/validate, persist, and kick
 * the runner. The NZB is stored on the row so a restart can restart the
 * download without re-fetching from the indexer.
 */
export async function enqueueNzbDownloadWorkflow(
    userId: string,
    input: {
        name: string;
        category: EngineDownloadCategory;
        nzbXml: string;
        password?: string | null;
    },
): Promise<EnqueuedNzbDownload> {
    let parsed;

    try {
        parsed = parseNzb(input.nzbXml);
    } catch (error) {
        throw new EnqueueNzbDownloadError(
            "invalid_nzb",
            error instanceof NzbParseError ? error.message : "The NZB could not be parsed.",
        );
    }

    const totalSegments = parsed.files.reduce((total, file) => total + file.segments.length, 0);

    const { availableBytes, filesystemCapacityBytes, constrainedDirectory } =
        await readDownloadCapacity();
    const reservation = await createEngineDownloadWithCapacityReservation(
        {
            userId,
            name: input.name.trim() || "Untitled download",
            category: input.category,
            nzbXml: input.nzbXml,
            password: input.password ?? parsed.password,
            totalBytes: parsed.declaredBytes,
            totalSegments,
        },
        {
            availableBytes,
            minimumFreeSpaceReserveBytes,
            // Keep room for both the assembled download and an unpacked copy.
            workspaceMultiplier: 2,
        },
    );

    if (!reservation.created) {
        throw new EnqueueNzbDownloadError(
            "insufficient_space",
            `There is not enough free disk space in the built-in downloader directory ` +
                `"${constrainedDirectory}" (${formatCapacity(availableBytes)} available; ` +
                `${
                    Number.isSafeInteger(reservation.requiredBytes)
                        ? formatCapacity(reservation.requiredBytes)
                        : "an invalid amount"
                } required for queued downloads, unpacking, and the safety reserve; ` +
                `${
                    Number.isSafeInteger(filesystemCapacityBytes)
                        ? formatCapacity(filesystemCapacityBytes)
                        : "an invalid amount"
                } total filesystem capacity).`,
            {
                availableBytes,
                filesystemCapacityBytes,
                requiredBytes: reservation.requiredBytes,
                activeReservationBytes: reservation.activeWorkspaceBytes,
                activeRemainingBytes: reservation.activeRemainingBytes,
                activeDownloadedBytes: Math.max(
                    0,
                    reservation.activeWorkspaceBytes - reservation.activeRemainingBytes * 2,
                ),
            },
        );
    }

    const record = reservation.record;

    return {
        id: record.id,
        name: record.name,
        totalBytes: record.totalBytes,
        totalSegments: record.totalSegments,
    };
}
