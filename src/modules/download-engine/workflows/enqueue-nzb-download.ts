import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import { NzbParseError, parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
  createEngineDownloadWithCapacityReservation,
} from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { type EngineDownloadCategory } from "@/lib/database/schema";

export type EnqueueNzbDownloadErrorCode = "invalid_nzb" | "insufficient_space";

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

function formatCapacity(bytes: number) {
  if (bytes >= 1024 ** 3) {
    return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  }

  return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
}

async function readDownloadCapacity() {
  // In-flight downloads assemble and unpack under DOWNLOAD_ENGINE_WORK_DIR;
  // the finalized output then lands under DOWNLOAD_ENGINE_DIR. The two may be
  // different filesystems, and a release must fit on both, so the tighter of
  // the two governs admission.
  await mkdir(env.DOWNLOAD_ENGINE_WORK_DIR, { recursive: true });
  await mkdir(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
  const workFilesystem = await statfs(env.DOWNLOAD_ENGINE_WORK_DIR);
  const outputFilesystem = await statfs(env.DOWNLOAD_ENGINE_DIR);
  const workAvailable = workFilesystem.bavail * workFilesystem.bsize;
  const outputAvailable = outputFilesystem.bavail * outputFilesystem.bsize;
  const constrained = workAvailable <= outputAvailable
    ? { filesystem: workFilesystem, directory: env.DOWNLOAD_ENGINE_WORK_DIR }
    : { filesystem: outputFilesystem, directory: env.DOWNLOAD_ENGINE_DIR };

  return {
    availableBytes: constrained.filesystem.bavail * constrained.filesystem.bsize,
    filesystemCapacityBytes: constrained.filesystem.blocks * constrained.filesystem.bsize,
    constrainedDirectory: constrained.directory,
  };
}

/**
 * Accepts NZB XML into the engine queue: parse/validate, persist, and kick
 * the runner. The NZB is stored on the row so a restart can restart the
 * download without re-fetching from the indexer.
 */
export async function enqueueNzbDownloadWorkflow(userId: string, input: {
  name: string;
  category: EngineDownloadCategory;
  nzbXml: string;
  password?: string | null;
}): Promise<EnqueuedNzbDownload> {
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

  const {
    availableBytes,
    filesystemCapacityBytes,
    constrainedDirectory,
  } = await readDownloadCapacity();
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
      `There is not enough free disk space in the built-in downloader directory `
      + `"${constrainedDirectory}" (${formatCapacity(availableBytes)} available; `
      + `${Number.isSafeInteger(reservation.requiredBytes)
        ? formatCapacity(reservation.requiredBytes)
        : "an invalid amount"} required for queued downloads, unpacking, and the safety reserve; `
      + `${Number.isSafeInteger(filesystemCapacityBytes)
        ? formatCapacity(filesystemCapacityBytes)
        : "an invalid amount"} total filesystem capacity).`,
      {
        availableBytes,
        filesystemCapacityBytes,
        requiredBytes: reservation.requiredBytes,
        activeReservationBytes: reservation.activeWorkspaceBytes,
        activeRemainingBytes: reservation.activeRemainingBytes,
        activeDownloadedBytes: Math.max(
          0,
          reservation.activeWorkspaceBytes - (reservation.activeRemainingBytes * 2),
        ),
      },
    );
  }
  const record = reservation.record;

  await ensureEngineRunnerStarted();

  return {
    id: record.id,
    name: record.name,
    totalBytes: record.totalBytes,
    totalSegments: record.totalSegments,
  };
}
