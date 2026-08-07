import { existsSync } from "node:fs";
import path from "node:path";

import { env } from "@/lib/env";
import { parseApprovedMediaRoots } from "@/lib/security/filesystem-policy";
import { getActiveEngineDownloadCapacityUsage } from "@/modules/download-engine/queue/engine-repository";
import {
    getLibraryDriveOverview,
    type LibraryDriveEntry,
} from "@/modules/media-library/queries/get-library-drive-overview";
import {
    downloadEngineWorkSnapshotId,
    downloadWorkspaceSnapshotId,
    findStorageSnapshot,
} from "@/modules/storage/repositories/storage-snapshot-repository";
import {
    getStorageSnapshotStatus,
    type StorageSnapshotStatus,
} from "@/modules/storage/storage-snapshot-status";

const minimumFreeSpaceReserveBytes = 512 * 1024 * 1024;

export type DownloadWorkspaceOverview = {
    configuredPath: string;
    effectivePath: string;
    exists: boolean;
    reachable: boolean;
    writable: boolean;
    freeSpaceBytes: number | null;
    totalSpaceBytes: number | null;
    activeDownloadBytes: number;
    processingReservationBytes: number;
    availableForNewDownloadsBytes: number | null;
    maximumNewDownloadBytes: number | null;
    snapshotStatus: StorageSnapshotStatus;
    lastCheckedAt: Date | null;
    probeError: string | null;
    statusMessage: string;
    workLocation: DownloadWorkspaceLocationOverview;
    outputLocation: DownloadWorkspaceLocationOverview;
};

export type DownloadWorkspaceLocationOverview = {
    configuredPath: string;
    effectivePath: string;
    exists: boolean;
    reachable: boolean;
    readable: boolean;
    writable: boolean;
    freeSpaceBytes: number | null;
    totalSpaceBytes: number | null;
    snapshotStatus: StorageSnapshotStatus;
    lastCheckedAt: Date | null;
    probeError: string | null;
};

export type StorageOverview = {
    runtime: "container" | "host";
    runtimeGuidance: string;
    approvedMediaRoots: string[];
    downloadWorkspace: DownloadWorkspaceOverview;
    libraryDestinations: LibraryDriveEntry[];
};

function workspaceStatusMessage(input: {
    status: StorageSnapshotStatus;
    exists: boolean;
    readable: boolean;
    writable: boolean;
    probeError: string | null;
}) {
    if (input.status === "unavailable") {
        return "No background workspace reading is available yet. Pages do not probe this path directly.";
    }

    if (input.status === "error") {
        return input.probeError
            ? `The latest background workspace check failed: ${input.probeError}`
            : "The latest background workspace check could not reach this path.";
    }

    if (input.status === "stale") {
        return "Showing the last successful background workspace reading; it is now stale.";
    }

    if (!input.readable) {
        return "The latest background check could not read the download workspace.";
    }

    if (!input.writable) {
        return "The latest background check could not write to the download workspace.";
    }

    return input.exists
        ? "The background worker recently confirmed the download workspace is reachable and writable."
        : "The background worker confirmed Nooklet can create the workspace when the first download starts.";
}

async function getDownloadWorkspaceOverview(): Promise<DownloadWorkspaceOverview> {
    const effectivePath = path.resolve(env.DOWNLOAD_ENGINE_DIR);
    const effectiveWorkPath = path.resolve(env.DOWNLOAD_ENGINE_WORK_DIR);
    const [capacityUsage, storedSnapshot, storedWorkSnapshot] = await Promise.all([
        getActiveEngineDownloadCapacityUsage(),
        findStorageSnapshot(downloadWorkspaceSnapshotId),
        findStorageSnapshot(downloadEngineWorkSnapshotId),
    ]);
    const snapshot = storedSnapshot?.path === effectivePath ? storedSnapshot : null;
    const workSnapshot = storedWorkSnapshot?.path === effectiveWorkPath ? storedWorkSnapshot : null;
    const outputStatus = getStorageSnapshotStatus(snapshot, effectivePath);
    const workStatus = getStorageSnapshotStatus(workSnapshot, effectiveWorkPath);
    const statusRank: Record<StorageSnapshotStatus, number> = {
        fresh: 0,
        stale: 1,
        error: 2,
        unavailable: 3,
    };
    const snapshotStatus =
        statusRank[workStatus] >= statusRank[outputStatus] ? workStatus : outputStatus;
    const activeDownloadBytes = capacityUsage.activeRemainingBytes;
    const processingReservationBytes =
        minimumFreeSpaceReserveBytes + capacityUsage.activeWorkspaceBytes;
    const constrainedSnapshot =
        snapshot?.freeSpaceBytes !== null &&
        snapshot?.freeSpaceBytes !== undefined &&
        workSnapshot?.freeSpaceBytes !== null &&
        workSnapshot?.freeSpaceBytes !== undefined
            ? workSnapshot.freeSpaceBytes <= snapshot.freeSpaceBytes
                ? workSnapshot
                : snapshot
            : null;
    const freeSpaceBytes = constrainedSnapshot?.freeSpaceBytes ?? null;
    const totalSpaceBytes = constrainedSnapshot?.totalSpaceBytes ?? null;
    const availableForNewDownloadsBytes =
        freeSpaceBytes === null ? null : Math.max(0, freeSpaceBytes - processingReservationBytes);
    const currentlyVerified =
        outputStatus === "fresh" &&
        workStatus === "fresh" &&
        snapshot?.reachable === true &&
        workSnapshot?.reachable === true;
    const exists = (snapshot?.exists ?? false) && (workSnapshot?.exists ?? false);
    const readable = (snapshot?.readable ?? false) && (workSnapshot?.readable ?? false);
    const writable = (snapshot?.writable ?? false) && (workSnapshot?.writable ?? false);
    const probeError =
        [
            workSnapshot?.errorMessage ? `Work: ${workSnapshot.errorMessage}` : null,
            snapshot?.errorMessage ? `Output: ${snapshot.errorMessage}` : null,
        ]
            .filter(Boolean)
            .join(" ") || null;
    const lastCheckedAt =
        snapshot?.checkedAt && workSnapshot?.checkedAt
            ? new Date(Math.min(snapshot.checkedAt.getTime(), workSnapshot.checkedAt.getTime()))
            : (snapshot?.checkedAt ?? workSnapshot?.checkedAt ?? null);
    const location = (
        configuredPath: string,
        resolvedPath: string,
        stored: typeof snapshot,
        status: StorageSnapshotStatus,
    ): DownloadWorkspaceLocationOverview => ({
        configuredPath,
        effectivePath: resolvedPath,
        exists: stored?.exists ?? false,
        reachable: status === "fresh" && stored?.reachable === true,
        readable: status === "fresh" && stored?.readable === true,
        writable: status === "fresh" && stored?.writable === true,
        freeSpaceBytes: stored?.freeSpaceBytes ?? null,
        totalSpaceBytes: stored?.totalSpaceBytes ?? null,
        snapshotStatus: status,
        lastCheckedAt: stored?.checkedAt ?? null,
        probeError: stored?.errorMessage ?? null,
    });

    return {
        configuredPath: env.DOWNLOAD_ENGINE_DIR,
        effectivePath,
        exists,
        reachable: currentlyVerified,
        writable: currentlyVerified && writable,
        freeSpaceBytes,
        totalSpaceBytes,
        activeDownloadBytes,
        processingReservationBytes,
        availableForNewDownloadsBytes,
        maximumNewDownloadBytes:
            availableForNewDownloadsBytes === null
                ? null
                : Math.floor(availableForNewDownloadsBytes / 2),
        snapshotStatus,
        lastCheckedAt,
        probeError,
        statusMessage: workspaceStatusMessage({
            status: snapshotStatus,
            exists,
            readable,
            writable,
            probeError,
        }),
        workLocation: location(
            env.DOWNLOAD_ENGINE_WORK_DIR,
            effectiveWorkPath,
            workSnapshot,
            workStatus,
        ),
        outputLocation: location(env.DOWNLOAD_ENGINE_DIR, effectivePath, snapshot, outputStatus),
    };
}

/**
 * Request-safe storage status. All mount observations come from SQLite rows
 * written by the isolated worker; rendering Home, Setup, or Settings performs
 * no stat/statfs/access call against a download or media bind mount.
 */
export async function getStorageOverview(userId: string): Promise<StorageOverview> {
    const [downloadWorkspace, libraryDestinations] = await Promise.all([
        getDownloadWorkspaceOverview(),
        getLibraryDriveOverview(userId),
    ]);
    const isContainer = existsSync("/.dockerenv") || Boolean(process.env.CONTAINER);

    return {
        runtime: isContainer ? "container" : "host",
        runtimeGuidance: isContainer
            ? "Paths shown here are paths inside the Nooklet container. Change the host folder by editing the matching volume binding, then keep the container path configured in Nooklet."
            : "Paths shown here are resolved on the machine running Nooklet. If you later use Docker, map each host folder to a stable container path.",
        approvedMediaRoots: parseApprovedMediaRoots(),
        downloadWorkspace,
        libraryDestinations,
    };
}
