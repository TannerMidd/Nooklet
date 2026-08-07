import { constants } from "node:fs";
import { access, stat, statfs } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import {
    listActiveMediaLibraryPaths,
    updateMediaLibraryPathSpace,
    type ActiveMediaLibraryPathRecord,
} from "@/modules/media-library/public";
import {
    downloadEngineWorkSnapshotId,
    downloadWorkspaceSnapshotId,
    libraryDestinationSnapshotId,
    upsertStorageSnapshot,
} from "@/modules/storage/repositories/storage-snapshot-repository";
import { listUsers } from "@/modules/users/public";

function isMissingPathError(error: unknown) {
    return Boolean(
        error && typeof error === "object" && "code" in error && error.code === "ENOENT",
    );
}

function probeErrorMessage(error: unknown) {
    if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
        return `Filesystem probe failed (${error.code}).`;
    }

    return "Filesystem probe failed.";
}

async function nearestExistingDirectory(candidate: string) {
    let current = path.dirname(candidate);

    while (true) {
        try {
            const currentStat = await stat(current);

            if (currentStat.isDirectory()) {
                return current;
            }
        } catch {
            // Continue toward the filesystem root.
        }

        const parent = path.dirname(current);

        if (parent === current) {
            return null;
        }

        current = parent;
    }
}

async function refreshDownloadStorageSnapshot(id: string, configuredPath: string) {
    const effectivePath = path.resolve(configuredPath);
    let exists = false;
    let inspectionPath = effectivePath;

    try {
        const workspaceStat = await stat(effectivePath);

        if (!workspaceStat.isDirectory()) {
            return upsertStorageSnapshot({
                id,
                kind: "download-workspace",
                path: effectivePath,
                exists: true,
                reachable: false,
                readable: false,
                writable: false,
                freeSpaceBytes: null,
                totalSpaceBytes: null,
                errorMessage: "The configured download workspace is not a folder.",
            });
        }

        exists = true;
    } catch (error) {
        if (!isMissingPathError(error)) {
            return upsertStorageSnapshot({
                id,
                kind: "download-workspace",
                path: effectivePath,
                exists: false,
                reachable: false,
                readable: false,
                writable: false,
                freeSpaceBytes: null,
                totalSpaceBytes: null,
                errorMessage: probeErrorMessage(error),
            });
        }

        inspectionPath = (await nearestExistingDirectory(effectivePath)) ?? effectivePath;
    }

    try {
        const [filesystem, readable, writable] = await Promise.all([
            statfs(inspectionPath),
            access(inspectionPath, constants.R_OK).then(
                () => true,
                () => false,
            ),
            access(inspectionPath, constants.W_OK).then(
                () => true,
                () => false,
            ),
        ]);

        return upsertStorageSnapshot({
            id,
            kind: "download-workspace",
            path: effectivePath,
            exists,
            reachable: true,
            readable,
            writable,
            freeSpaceBytes: filesystem.bsize * filesystem.bavail,
            totalSpaceBytes: filesystem.bsize * filesystem.blocks,
            errorMessage: null,
        });
    } catch (error) {
        return upsertStorageSnapshot({
            id,
            kind: "download-workspace",
            path: effectivePath,
            exists,
            reachable: false,
            readable: false,
            writable: false,
            freeSpaceBytes: null,
            totalSpaceBytes: null,
            errorMessage: probeErrorMessage(error),
        });
    }
}

export function refreshDownloadWorkspaceStorageSnapshot() {
    return refreshDownloadStorageSnapshot(downloadWorkspaceSnapshotId, env.DOWNLOAD_ENGINE_DIR);
}

export function refreshDownloadEngineWorkStorageSnapshot() {
    return refreshDownloadStorageSnapshot(
        downloadEngineWorkSnapshotId,
        env.DOWNLOAD_ENGINE_WORK_DIR,
    );
}

export async function refreshLibraryDestinationStorageSnapshot(
    entry: ActiveMediaLibraryPathRecord,
) {
    const effectivePath = path.resolve(entry.path.path);

    try {
        const [filesystem, readable, writable] = await Promise.all([
            statfs(effectivePath),
            access(effectivePath, constants.R_OK).then(
                () => true,
                () => false,
            ),
            access(effectivePath, constants.W_OK).then(
                () => true,
                () => false,
            ),
        ]);
        const freeSpaceBytes = filesystem.bsize * filesystem.bavail;
        const totalSpaceBytes = filesystem.bsize * filesystem.blocks;

        if (
            freeSpaceBytes !== entry.path.freeSpaceBytes ||
            totalSpaceBytes !== entry.path.totalSpaceBytes
        ) {
            await updateMediaLibraryPathSpace({
                pathId: entry.path.id,
                freeSpaceBytes,
                totalSpaceBytes,
            });
        }

        return upsertStorageSnapshot({
            id: libraryDestinationSnapshotId(entry.path.id),
            kind: "library-destination",
            path: effectivePath,
            exists: true,
            reachable: true,
            readable,
            writable,
            freeSpaceBytes,
            totalSpaceBytes,
            errorMessage: null,
        });
    } catch (error) {
        return upsertStorageSnapshot({
            id: libraryDestinationSnapshotId(entry.path.id),
            kind: "library-destination",
            path: effectivePath,
            exists: false,
            reachable: false,
            readable: false,
            writable: false,
            freeSpaceBytes: null,
            totalSpaceBytes: null,
            errorMessage: probeErrorMessage(error),
        });
    }
}

/**
 * Performs all potentially blocking bind-mount probes. This function must only
 * be invoked by the isolated background-worker process, never by a route,
 * server action, or React server component.
 */
export async function refreshStorageSnapshots() {
    const users = await listUsers();
    const pathsById = new Map<string, ActiveMediaLibraryPathRecord>();

    for (const user of users) {
        for (const entry of await listActiveMediaLibraryPaths(user.id)) {
            pathsById.set(entry.path.id, entry);
        }
    }

    // Start every independent target together. Each probe persists its own
    // result before this aggregate settles, so one wedged bind mount cannot
    // prevent healthy paths queued behind it from refreshing in the disposable
    // process. The supervisor still enforces the process-wide kill ceiling.
    const results = await Promise.allSettled([
        refreshDownloadWorkspaceStorageSnapshot(),
        refreshDownloadEngineWorkStorageSnapshot(),
        ...Array.from(pathsById.values(), (entry) =>
            refreshLibraryDestinationStorageSnapshot(entry),
        ),
    ]);
    const failure = results.find(
        (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    if (failure) {
        throw failure.reason;
    }
}
