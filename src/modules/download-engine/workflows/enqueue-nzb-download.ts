import { NzbParseError, parseNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { createEngineDownload } from "@/modules/download-engine/queue/engine-repository";
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
