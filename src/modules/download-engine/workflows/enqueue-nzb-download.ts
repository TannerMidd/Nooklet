import { mkdir, statfs } from "node:fs/promises";

import { env } from "@/lib/env";
import { NzbParseError, parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
  createEngineDownload,
  getActiveEngineDownloadRemainingBytes,
} from "@/modules/download-engine/queue/engine-repository";
import { ensureEngineRunnerStarted } from "@/modules/download-engine/runtime/engine-runner";
import { type EngineDownloadCategory } from "@/lib/database/schema";

export class EnqueueNzbDownloadError extends Error {
  constructor(message: string) {
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

async function assertDownloadCapacity(downloadBytes: number) {
  await mkdir(env.DOWNLOAD_ENGINE_DIR, { recursive: true });
  const filesystem = await statfs(env.DOWNLOAD_ENGINE_DIR);
  const availableBytes = filesystem.bavail * filesystem.bsize;
  const alreadyReservedBytes = await getActiveEngineDownloadRemainingBytes();
  // Keep room for both the assembled download and an unpacked copy.
  const requiredBytes = minimumFreeSpaceReserveBytes
    + (alreadyReservedBytes * 2)
    + (downloadBytes * 2);

  if (!Number.isSafeInteger(requiredBytes) || availableBytes < requiredBytes) {
    throw new EnqueueNzbDownloadError(
      `There is not enough free disk space in the built-in downloader directory `
      + `"${env.DOWNLOAD_ENGINE_DIR}" (${formatCapacity(availableBytes)} available; `
      + `${Number.isSafeInteger(requiredBytes) ? formatCapacity(requiredBytes) : "an invalid amount"} required `
      + "for queued downloads, unpacking, and the safety reserve).",
    );
  }
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
      error instanceof NzbParseError ? error.message : "The NZB could not be parsed.",
    );
  }

  const totalSegments = parsed.files.reduce((total, file) => total + file.segments.length, 0);

  await assertDownloadCapacity(parsed.declaredBytes);

  const record = await createEngineDownload({
    userId,
    name: input.name.trim() || "Untitled download",
    category: input.category,
    nzbXml: input.nzbXml,
    password: input.password ?? parsed.password,
    totalBytes: parsed.declaredBytes,
    totalSegments,
  });

  await ensureEngineRunnerStarted();

  return {
    id: record.id,
    name: record.name,
    totalBytes: record.totalBytes,
    totalSegments: record.totalSegments,
  };
}
