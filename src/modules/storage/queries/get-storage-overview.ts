import { constants, existsSync } from "node:fs";
import { access, stat, statfs } from "node:fs/promises";
import path from "node:path";

import { env } from "@/lib/env";
import { parseApprovedMediaRoots } from "@/lib/security/filesystem-policy";
import {
  getActiveEngineDownloadCapacityUsage,
} from "@/modules/download-engine/queue/engine-repository";
import {
  getLibraryDriveOverview,
  type LibraryDriveEntry,
} from "@/modules/media-library/queries/get-library-drive-overview";

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
  statusMessage: string;
};

export type StorageOverview = {
  runtime: "container" | "host";
  runtimeGuidance: string;
  approvedMediaRoots: string[];
  downloadWorkspace: DownloadWorkspaceOverview;
  libraryDestinations: LibraryDriveEntry[];
};

function isMissingPathError(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "ENOENT");
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

async function inspectDownloadWorkspace(): Promise<DownloadWorkspaceOverview> {
  const effectivePath = path.resolve(env.DOWNLOAD_ENGINE_DIR);
  const capacityUsage = await getActiveEngineDownloadCapacityUsage();
  const activeDownloadBytes = capacityUsage.activeRemainingBytes;
  const processingReservationBytes =
    minimumFreeSpaceReserveBytes + capacityUsage.activeWorkspaceBytes;
  let exists = false;
  let inspectionPath = effectivePath;

  try {
    const workspaceStat = await stat(effectivePath);
    if (!workspaceStat.isDirectory()) {
      return {
        configuredPath: env.DOWNLOAD_ENGINE_DIR,
        effectivePath,
        exists: true,
        reachable: false,
        writable: false,
        freeSpaceBytes: null,
        totalSpaceBytes: null,
        activeDownloadBytes,
        processingReservationBytes,
        availableForNewDownloadsBytes: null,
        maximumNewDownloadBytes: null,
        statusMessage: "The configured download workspace is not a folder.",
      };
    }
    exists = true;
  } catch (error) {
    if (!isMissingPathError(error)) {
      return {
        configuredPath: env.DOWNLOAD_ENGINE_DIR,
        effectivePath,
        exists: false,
        reachable: false,
        writable: false,
        freeSpaceBytes: null,
        totalSpaceBytes: null,
        activeDownloadBytes,
        processingReservationBytes,
        availableForNewDownloadsBytes: null,
        maximumNewDownloadBytes: null,
        statusMessage: "Nooklet cannot inspect the configured download workspace.",
      };
    }

    inspectionPath = await nearestExistingDirectory(effectivePath) ?? effectivePath;
  }

  try {
    const [filesystem, writable] = await Promise.all([
      statfs(inspectionPath),
      access(inspectionPath, constants.R_OK | constants.W_OK).then(() => true, () => false),
    ]);
    const freeSpaceBytes = filesystem.bsize * filesystem.bavail;
    const totalSpaceBytes = filesystem.bsize * filesystem.blocks;
    const availableForNewDownloadsBytes = Math.max(0, freeSpaceBytes - processingReservationBytes);

    return {
      configuredPath: env.DOWNLOAD_ENGINE_DIR,
      effectivePath,
      exists,
      reachable: true,
      writable,
      freeSpaceBytes,
      totalSpaceBytes,
      activeDownloadBytes,
      processingReservationBytes,
      availableForNewDownloadsBytes,
      maximumNewDownloadBytes: Math.floor(availableForNewDownloadsBytes / 2),
      statusMessage: writable
        ? exists
          ? "Download workspace is reachable and writable."
          : "Nooklet can create the download workspace when the first download starts."
        : "Nooklet cannot write to the download workspace.",
    };
  } catch {
    return {
      configuredPath: env.DOWNLOAD_ENGINE_DIR,
      effectivePath,
      exists,
      reachable: false,
      writable: false,
      freeSpaceBytes: null,
      totalSpaceBytes: null,
      activeDownloadBytes,
      processingReservationBytes,
      availableForNewDownloadsBytes: null,
      maximumNewDownloadBytes: null,
      statusMessage: "The filesystem containing the download workspace is not reachable.",
    };
  }
}

export async function getStorageOverview(userId: string): Promise<StorageOverview> {
  const [downloadWorkspace, libraryDestinations] = await Promise.all([
    inspectDownloadWorkspace(),
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
