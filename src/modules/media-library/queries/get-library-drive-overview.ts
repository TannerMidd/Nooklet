import pathModule from "node:path";

import { type RecommendationMediaType } from "@/lib/database/schema";
import {
  listActiveMediaLibraryPaths,
} from "@/modules/media-library/repositories/media-library-repository";
import {
  libraryDestinationSnapshotId,
  listStorageSnapshots,
} from "@/modules/storage/public";
import {
  getStorageSnapshotStatus,
  type StorageSnapshotStatus,
} from "@/modules/storage/storage-snapshot-status";

export type LibraryDriveEntry = {
  pathId: string;
  label: string;
  path: string;
  effectivePath: string;
  libraryName: string;
  mediaType: RecommendationMediaType;
  isDownloadDefault: boolean;
  freeSpaceBytes: number | null;
  totalSpaceBytes: number | null;
  /** True only when a recent background probe reached the folder. */
  live: boolean;
  readable: boolean;
  writable: boolean;
  snapshotStatus: StorageSnapshotStatus;
  lastCheckedAt: Date | null;
  probeError: string | null;
  statusMessage: string;
};

function statusMessage(input: {
  status: StorageSnapshotStatus;
  readable: boolean;
  writable: boolean;
  probeError: string | null;
  hasLegacyCapacity: boolean;
}) {
  if (input.status === "unavailable") {
    return input.hasLegacyCapacity
      ? "Showing a saved capacity reading. The background worker has not recorded reachability yet."
      : "No background storage reading is available yet. Pages do not probe this folder directly."
  }

  if (input.status === "error") {
    return input.probeError
      ? `The latest background storage check failed: ${input.probeError}`
      : "The latest background storage check could not reach this folder.";
  }

  if (input.status === "stale") {
    return "Showing the last successful background reading; it is now stale.";
  }

  return !input.readable
    ? "The latest background check could not read this folder."
    : !input.writable
      ? "The latest background check could read this folder but could not write to it."
      : "The background worker recently confirmed this folder is reachable and writable.";
}

/**
 * Returns only database-backed storage observations. The web request process
 * must never touch media bind mounts: a wedged Docker filesystem call cannot
 * be timed out or cancelled and can starve every libuv worker thread.
 */
export async function getLibraryDriveOverview(userId: string): Promise<LibraryDriveEntry[]> {
  const activePaths = await listActiveMediaLibraryPaths(userId);
  const snapshots = await listStorageSnapshots(
    activePaths.map(({ path }) => libraryDestinationSnapshotId(path.id)),
  );
  const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

  const entries = activePaths.map(({ library, path }) => {
    const effectivePath = pathModule.resolve(path.path);
    const storedSnapshot = snapshotsById.get(libraryDestinationSnapshotId(path.id));
    const snapshot = storedSnapshot?.path === effectivePath ? storedSnapshot : null;
    const snapshotStatus = getStorageSnapshotStatus(snapshot, effectivePath);
    const hasLegacyCapacity = !storedSnapshot
      && path.freeSpaceBytes !== null
      && path.totalSpaceBytes !== null;
    const freeSpaceBytes = snapshot
      ? snapshot.freeSpaceBytes ?? path.freeSpaceBytes
      : storedSnapshot
        ? null
        : path.freeSpaceBytes;
    const totalSpaceBytes = snapshot
      ? snapshot.totalSpaceBytes ?? path.totalSpaceBytes
      : storedSnapshot
        ? null
        : path.totalSpaceBytes;
    const readable = snapshot?.readable ?? false;
    const writable = snapshot?.writable ?? false;
    const probeError = snapshot?.errorMessage ?? null;

    return {
      pathId: path.id,
      label: path.label,
      path: path.path,
      effectivePath,
      libraryName: library.name,
      mediaType: library.mediaType,
      isDownloadDefault: path.isDownloadDefault,
      freeSpaceBytes,
      totalSpaceBytes,
      live: snapshotStatus === "fresh" && snapshot?.reachable === true,
      readable,
      writable,
      snapshotStatus,
      lastCheckedAt: snapshot?.checkedAt ?? null,
      probeError,
      statusMessage: statusMessage({
        status: snapshotStatus,
        readable,
        writable,
        probeError,
        hasLegacyCapacity,
      }),
    };
  });

  return entries.sort((left, right) => {
    if (left.mediaType !== right.mediaType) {
      return left.mediaType < right.mediaType ? -1 : 1;
    }

    if (left.isDownloadDefault !== right.isDownloadDefault) {
      return left.isDownloadDefault ? -1 : 1;
    }

    return left.label.localeCompare(right.label);
  });
}
