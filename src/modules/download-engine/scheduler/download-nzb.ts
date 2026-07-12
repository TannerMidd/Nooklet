import path from "node:path";
import { mkdir, open, type FileHandle } from "node:fs/promises";

import { sanitizeDownloadFileName } from "@/modules/download-engine/assembly/sanitize-file-name";
import { NntpClient, NntpError, type NntpServerOptions } from "@/modules/download-engine/nntp/nntp-client";
import { type ParsedNzb } from "@/modules/download-engine/nzb/parse-nzb";
import { decodeYencArticle } from "@/modules/download-engine/yenc/decode-yenc";

/**
 * Segment scheduler + assembly (ADR-0002 slice 2). Fetches every segment of a
 * parsed NZB over a pool of NNTP connections and writes decoded payloads
 * directly at their yEnc part offsets, so files assemble in place without
 * intermediate segment files.
 */

export type EngineServerConfig = NntpServerOptions & {
  /** Parallel NNTP connections to open against this server. */
  connections: number;
};

export type DownloadNzbProgress = {
  downloadedBytes: number;
  completedSegments: number;
  failedSegments: number;
  totalSegments: number;
};

export type DownloadedNzbFile = {
  fileIndex: number;
  subject: string;
  /** Resolved on the first successfully decoded segment; null if none landed. */
  fileName: string | null;
  filePath: string | null;
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
  bytesWritten: number;
  ok: boolean;
};

export type DownloadNzbResult = {
  files: DownloadedNzbFile[];
  downloadedBytes: number;
  completedSegments: number;
  failedSegments: number;
  totalSegments: number;
  aborted: boolean;
  /** True when every file completed with zero failed segments. */
  ok: boolean;
};

export type NntpClientLike = Pick<NntpClient, "connect" | "body" | "quit" | "destroy">;

export type DownloadNzbInput = {
  nzb: ParsedNzb;
  server: EngineServerConfig;
  /** Directory files assemble into; created if missing. */
  workDir: string;
  onProgress?: (progress: DownloadNzbProgress) => void;
  /** Checked between segments; return true to stop the run. */
  shouldAbort?: () => boolean;
  /** Transient-failure retries per segment (permanent failures never retry). */
  maxRetriesPerSegment?: number;
  /** Test seam — swap the socket client for a scripted fake. */
  clientFactory?: (options: NntpServerOptions) => NntpClientLike;
};

type SegmentTask = {
  fileIndex: number;
  segmentNumber: number;
  messageId: string;
};

type FileAssemblyState = {
  fileIndex: number;
  subject: string;
  fileName: string | null;
  filePath: string | null;
  handle: FileHandle | null;
  opening: Promise<void> | null;
  totalSegments: number;
  completedSegments: number;
  failedSegments: number;
  bytesWritten: number;
};

function defaultClientFactory(options: NntpServerOptions): NntpClientLike {
  return new NntpClient(options);
}

/** Derives a stable fallback name from the NZB subject when yEnc omits one. */
function fallbackFileName(subject: string, fileIndex: number) {
  const quoted = subject.match(/"([^"]+)"/)?.[1];

  return sanitizeDownloadFileName(quoted ?? subject, `file-${fileIndex + 1}.bin`);
}

export async function downloadNzb(input: DownloadNzbInput): Promise<DownloadNzbResult> {
  const clientFactory = input.clientFactory ?? defaultClientFactory;
  const maxRetries = input.maxRetriesPerSegment ?? 2;

  await mkdir(input.workDir, { recursive: true });

  const fileStates: FileAssemblyState[] = input.nzb.files.map((file, fileIndex) => ({
    fileIndex,
    subject: file.subject,
    fileName: null,
    filePath: null,
    handle: null,
    opening: null,
    totalSegments: file.segments.length,
    completedSegments: 0,
    failedSegments: 0,
    bytesWritten: 0,
  }));

  const tasks: SegmentTask[] = input.nzb.files.flatMap((file, fileIndex) =>
    file.segments.map((segment) => ({
      fileIndex,
      segmentNumber: segment.number,
      messageId: segment.messageId,
    })),
  );

  const totals = {
    downloadedBytes: 0,
    completedSegments: 0,
    failedSegments: 0,
  };
  let nextTaskIndex = 0;
  let aborted = false;

  const reportProgress = () => {
    input.onProgress?.({
      downloadedBytes: totals.downloadedBytes,
      completedSegments: totals.completedSegments,
      failedSegments: totals.failedSegments,
      totalSegments: tasks.length,
    });
  };

  /** Opens (once) the target file for a state, pre-sized to the yEnc file size. */
  async function ensureFileOpen(state: FileAssemblyState, decodedName: string, fileSize: number) {
    if (state.handle) {
      return;
    }

    if (!state.opening) {
      state.opening = (async () => {
        const name = sanitizeDownloadFileName(decodedName, fallbackFileName(state.subject, state.fileIndex));
        const filePath = path.join(input.workDir, name);
        const handle = await open(filePath, "w");
        await handle.truncate(fileSize);
        state.fileName = name;
        state.filePath = filePath;
        state.handle = handle;
      })();
    }

    await state.opening;
  }

  async function fetchSegment(client: NntpClientLike, task: SegmentTask) {
    const body = await client.body(task.messageId);
    const decoded = decodeYencArticle(body);
    const state = fileStates[task.fileIndex];

    await ensureFileOpen(state, decoded.name, decoded.fileSize);

    const offset = decoded.part ? decoded.part.begin - 1 : 0;
    await state.handle!.write(decoded.data, 0, decoded.data.length, offset);

    state.bytesWritten += decoded.data.length;
    totals.downloadedBytes += decoded.data.length;

    // A CRC/size mismatch still writes the bytes (PAR2 can often repair a
    // near-miss) but counts the segment as damaged so finalization knows.
    if (decoded.crcOk === false || !decoded.sizeOk) {
      throw new NntpError("protocol-error", `Segment <${task.messageId}> failed integrity checks.`, true);
    }
  }

  async function runWorker() {
    let client: NntpClientLike | null = null;

    const getClient = async () => {
      if (!client) {
        client = clientFactory(input.server);
        await client.connect();
      }

      return client;
    };

    const dropClient = () => {
      client?.destroy();
      client = null;
    };

    for (;;) {
      if (aborted || input.shouldAbort?.()) {
        aborted = true;
        break;
      }

      const taskIndex = nextTaskIndex;

      if (taskIndex >= tasks.length) {
        break;
      }

      nextTaskIndex += 1;
      const task = tasks[taskIndex];
      const state = fileStates[task.fileIndex];
      let failed = true;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          await fetchSegment(await getClient(), task);
          failed = false;
          break;
        } catch (error) {
          const permanent = error instanceof NntpError && error.permanent;
          const connectionLost =
            error instanceof NntpError &&
            (error.kind === "connection-closed" || error.kind === "timeout" || error.kind === "connect-failed");

          if (connectionLost) {
            dropClient();
          }

          if (permanent && error instanceof NntpError && error.kind === "auth-failed") {
            // Credentials are wrong for every segment — stop the whole run.
            aborted = true;
            break;
          }

          if (permanent || attempt === maxRetries) {
            break;
          }
        }
      }

      if (failed) {
        state.failedSegments += 1;
        totals.failedSegments += 1;
      } else {
        state.completedSegments += 1;
        totals.completedSegments += 1;
      }

      reportProgress();
    }

    if (client) {
      await (client as NntpClientLike).quit();
    }
  }

  const workerCount = Math.max(1, Math.min(input.server.connections, tasks.length));

  try {
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  } finally {
    for (const state of fileStates) {
      await state.handle?.close().catch(() => undefined);
    }
  }

  const files: DownloadedNzbFile[] = fileStates.map((state) => ({
    fileIndex: state.fileIndex,
    subject: state.subject,
    fileName: state.fileName,
    filePath: state.filePath,
    totalSegments: state.totalSegments,
    completedSegments: state.completedSegments,
    failedSegments: state.failedSegments,
    bytesWritten: state.bytesWritten,
    ok: state.failedSegments === 0 && state.completedSegments === state.totalSegments,
  }));

  return {
    files,
    downloadedBytes: totals.downloadedBytes,
    completedSegments: totals.completedSegments,
    failedSegments: totals.failedSegments,
    totalSegments: tasks.length,
    aborted,
    ok: !aborted && files.every((file) => file.ok),
  };
}
