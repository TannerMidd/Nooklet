import { constants } from "node:fs";
import { access, statfs } from "node:fs/promises";
import pathModule from "node:path";

import {
  listActiveMediaLibraryPaths,
  updateMediaLibraryPathSpace,
} from "@/modules/media-library/repositories/media-library-repository";
import { type RecommendationMediaType } from "@/lib/database/schema";

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
  /** False when the folder could not be reached for a live space reading. */
  live: boolean;
  readable: boolean;
  writable: boolean;
  statusMessage: string;
};

/**
 * Space overview for every active library folder. Reads the filesystem live
 * (each mapped drive reports its own volume) and falls back to the last
 * stored measurement when a folder is unreachable, e.g. a disconnected
 * network drive.
 */
export async function getLibraryDriveOverview(userId: string): Promise<LibraryDriveEntry[]> {
  const activePaths = await listActiveMediaLibraryPaths(userId);
  const entries: LibraryDriveEntry[] = [];

  for (const { library, path } of activePaths) {
    let freeSpaceBytes = path.freeSpaceBytes;
    let totalSpaceBytes = path.totalSpaceBytes;
    let live = false;
    let readable = false;
    let writable = false;
    let statusMessage = "The folder is not reachable from Nooklet.";

    try {
      const [stats, readResult, writeResult] = await Promise.all([
        statfs(path.path),
        access(path.path, constants.R_OK).then(() => true, () => false),
        access(path.path, constants.W_OK).then(() => true, () => false),
      ]);
      freeSpaceBytes = stats.bsize * stats.bavail;
      totalSpaceBytes = stats.bsize * stats.blocks;
      live = true;
      readable = readResult;
      writable = writeResult;
      statusMessage = !readable
        ? "Nooklet cannot read this folder."
        : !writable
          ? "Nooklet can read this folder but cannot import files into it."
          : "Folder is reachable and writable.";

      if (freeSpaceBytes !== path.freeSpaceBytes || totalSpaceBytes !== path.totalSpaceBytes) {
        await updateMediaLibraryPathSpace({ pathId: path.id, freeSpaceBytes, totalSpaceBytes });
      }
    } catch {
      // Keep the stored measurement; the UI marks the reading as stale.
    }

    entries.push({
      pathId: path.id,
      label: path.label,
      path: path.path,
      effectivePath: pathModule.resolve(path.path),
      libraryName: library.name,
      mediaType: library.mediaType,
      isDownloadDefault: path.isDownloadDefault,
      freeSpaceBytes,
      totalSpaceBytes,
      live,
      readable,
      writable,
      statusMessage,
    });
  }

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
