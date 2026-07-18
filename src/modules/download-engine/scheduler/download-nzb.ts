import path from "node:path";
import { mkdir, open, type FileHandle } from "node:fs/promises";

import { sanitizeDownloadFileName } from "@/modules/download-engine/assembly/sanitize-file-name";
import {
  NntpClient,
  NntpError,
  type NntpErrorKind,
  type NntpServerOptions,
} from "@/modules/download-engine/nntp/nntp-client";
import { type ParsedNzb } from "@/modules/download-engine/nzb/parse-nzb";
import {
  decodeYencArticle,
  YencDecodeError,
} from "@/modules/download-engine/yenc/decode-yenc";

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
  /**
   * True when the transfer stopped early because more data was lost than any
   * PAR2 recovery set in this NZB could repair — the release is a write-off
   * and the caller should move on instead of fetching the remainder.
   */
  unrecoverable: boolean;
  failureKinds: NntpErrorKind[];
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
  declaredBytes: number;
  messageId: string;
};

type FileAssemblyState = {
  fileIndex: number;
  subject: string;
  fileName: string | null;
  filePath: string | null;
  handle: FileHandle | null;
  opening: Promise<void> | null;
  decodedName: string | null;
  expectedFileSize: number | null;
  ranges: Array<{ begin: number; end: number }>;
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

/** PAR2 recovery volumes are identifiable from the NZB subject line. */
function isPar2Subject(subject: string) {
  return /\.par2\b/i.test(subject);
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
    decodedName: null,
    expectedFileSize: null,
    ranges: [],
    totalSegments: file.segments.length,
    completedSegments: 0,
    failedSegments: 0,
    bytesWritten: 0,
  }));

  const tasks: SegmentTask[] = input.nzb.files.flatMap((file, fileIndex) =>
    file.segments.map((segment) => ({
      fileIndex,
      segmentNumber: segment.number,
      declaredBytes: segment.bytes,
      messageId: segment.messageId,
    })),
  );

  const totals = {
    downloadedBytes: 0,
    completedSegments: 0,
    failedSegments: 0,
  };

  // Unrecoverable-release detection. NZB segment sizes are yEnc-encoded for
  // payload and PAR2 volumes alike, so once the encoded bytes lost from data
  // files exceed the encoded bytes of the still-fetchable recovery set, no
  // PAR2 repair can succeed and fetching the remainder is pure waste. PAR2
  // block granularity only ever lowers real capacity below this byte-level
  // estimate, so the abandon decision cannot fire on a repairable release.
  // When no PAR2 set is visible (fully obfuscated posts can hide one), a 10%
  // allowance stands in for the largest plausible hidden recovery set.
  const par2FileIndexes = new Set(
    input.nzb.files.flatMap((file, index) => (isPar2Subject(file.subject) ? [index] : [])),
  );
  const par2DeclaredBytes = input.nzb.files.reduce(
    (total, file, index) => (par2FileIndexes.has(index) ? total + file.declaredBytes : total),
    0,
  );
  const hiddenRecoveryAllowance = par2DeclaredBytes > 0
    ? 0
    : Math.floor(input.nzb.declaredBytes * 0.1);
  let failedDataBytes = 0;
  let lostPar2Bytes = 0;
  let unrecoverable = false;

  let nextTaskIndex = 0;
  let aborted = false;
  let fatalError: Error | null = null;
  const failureKinds = new Set<NntpErrorKind>();
  const reservedOutputNames = new Set<string>();

  const reportProgress = () => {
    input.onProgress?.({
      downloadedBytes: totals.downloadedBytes,
      completedSegments: totals.completedSegments,
      failedSegments: totals.failedSegments,
      totalSegments: tasks.length,
    });
  };

  function reserveOutputName(decodedName: string, state: FileAssemblyState) {
    const sanitized = sanitizeDownloadFileName(
      decodedName,
      fallbackFileName(state.subject, state.fileIndex),
    );
    const extension = path.extname(sanitized);
    const baseName = extension ? sanitized.slice(0, -extension.length) : sanitized;
    let candidate = sanitized;
    let suffix = 1;

    while (reservedOutputNames.has(candidate.toLocaleLowerCase())) {
      candidate = `${baseName}.${state.fileIndex + 1}-${suffix}${extension}`;
      suffix += 1;
    }

    reservedOutputNames.add(candidate.toLocaleLowerCase());
    return candidate;
  }

  /** Opens (once) the target file for a state, pre-sized to the yEnc file size. */
  async function ensureFileOpen(state: FileAssemblyState, decodedName: string, fileSize: number) {
    if (state.handle) {
      return;
    }

    if (!state.opening) {
      state.opening = (async () => {
        const name = reserveOutputName(decodedName, state);
        const filePath = path.join(input.workDir, name);
        const handle = await open(filePath, "wx");
        await handle.truncate(fileSize);
        state.decodedName = decodedName;
        state.expectedFileSize = fileSize;
        state.fileName = name;
        state.filePath = filePath;
        state.handle = handle;
      })();
    }

    await state.opening;
  }

  async function fetchSegment(client: NntpClientLike, task: SegmentTask) {
    const body = await client.body(task.messageId);
    const declaredFileBytes = input.nzb.files[task.fileIndex].declaredBytes;
    let decoded: ReturnType<typeof decodeYencArticle>;

    try {
      decoded = decodeYencArticle(body, { maxFileBytes: declaredFileBytes });
    } catch (error) {
      if (error instanceof YencDecodeError) {
        throw new NntpError("protocol-error", error.message, true);
      }

      throw error;
    }
    const state = fileStates[task.fileIndex];

    if (decoded.data.length > task.declaredBytes) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> exceeds its NZB-declared byte size.`,
        true,
      );
    }

    if (state.decodedName !== null && state.decodedName !== decoded.name) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> changed the yEnc file name.`,
        true,
      );
    }

    if (state.expectedFileSize !== null && state.expectedFileSize !== decoded.fileSize) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> changed the yEnc file size.`,
        true,
      );
    }

    if (state.totalSegments > 1 && !decoded.part) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> omitted its multipart byte range.`,
        true,
      );
    }

    if (decoded.part && decoded.part.number !== null && decoded.part.number !== task.segmentNumber) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> declared the wrong part number.`,
        true,
      );
    }

    if (decoded.part && decoded.part.total !== null && decoded.part.total !== state.totalSegments) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> declared an inconsistent part count.`,
        true,
      );
    }

    await ensureFileOpen(state, decoded.name, decoded.fileSize);

    // Another connection may have opened this file while this segment was
    // decoding; re-check the canonical metadata after the shared open.
    if (state.decodedName !== decoded.name || state.expectedFileSize !== decoded.fileSize) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> conflicts with another segment's yEnc metadata.`,
        true,
      );
    }

    const range = decoded.part
      ? { begin: decoded.part.begin, end: decoded.part.end }
      : { begin: 1, end: decoded.fileSize };

    if (state.ranges.some((existing) => range.begin <= existing.end && range.end >= existing.begin)) {
      throw new NntpError(
        "protocol-error",
        `Segment <${task.messageId}> overlaps another yEnc byte range.`,
        true,
      );
    }

    if (decoded.crcOk === false || !decoded.sizeOk) {
      throw new NntpError("protocol-error", `Segment <${task.messageId}> failed integrity checks.`, true);
    }

    state.ranges.push(range);
    const offset = range.begin - 1;
    let bytesWritten = 0;

    try {
      while (bytesWritten < decoded.data.length) {
        const write = await state.handle!.write(
          decoded.data,
          bytesWritten,
          decoded.data.length - bytesWritten,
          offset + bytesWritten,
        );

        if (write.bytesWritten <= 0) {
          throw new Error("The assembled file stopped accepting bytes.");
        }

        bytesWritten += write.bytesWritten;
      }
    } catch (error) {
      state.ranges = state.ranges.filter((candidate) => candidate !== range);
      throw error;
    }

    state.bytesWritten += decoded.data.length;
    totals.downloadedBytes += decoded.data.length;
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

      if (unrecoverable) {
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
      let terminalFailureKind: NntpErrorKind | null = null;

      for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
        try {
          await fetchSegment(await getClient(), task);
          failed = false;
          break;
        } catch (error) {
          if (!(error instanceof NntpError)) {
            aborted = true;
            fatalError ??= error instanceof Error
              ? error
              : new Error("The segment worker failed unexpectedly.");
            break;
          }

          terminalFailureKind = error.kind;
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
            fatalError = error;
            break;
          }

          if (permanent || attempt === maxRetries) {
            break;
          }

          // Another worker may have proven the release unrepairable while
          // this attempt was in flight; further retries cannot change that.
          if (unrecoverable) {
            break;
          }
        }
      }

      if (failed) {
        if (terminalFailureKind) failureKinds.add(terminalFailureKind);
        state.failedSegments += 1;
        totals.failedSegments += 1;

        if (par2FileIndexes.has(task.fileIndex)) {
          lostPar2Bytes += task.declaredBytes;
        } else {
          failedDataBytes += task.declaredBytes;
        }

        if (failedDataBytes > Math.max(0, par2DeclaredBytes - lostPar2Bytes) + hiddenRecoveryAllowance) {
          unrecoverable = true;
        }
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

  if (fatalError) {
    throw fatalError;
  }

  function hasCompleteCoverage(state: FileAssemblyState) {
    if (state.expectedFileSize === null || state.ranges.length === 0) {
      return false;
    }

    const sorted = [...state.ranges].sort((left, right) => left.begin - right.begin);
    let expectedBegin = 1;

    for (const range of sorted) {
      if (range.begin !== expectedBegin) {
        return false;
      }
      expectedBegin = range.end + 1;
    }

    return expectedBegin === state.expectedFileSize + 1;
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
    ok: state.failedSegments === 0
      && state.completedSegments === state.totalSegments
      && hasCompleteCoverage(state),
  }));

  return {
    files,
    downloadedBytes: totals.downloadedBytes,
    completedSegments: totals.completedSegments,
    failedSegments: totals.failedSegments,
    totalSegments: tasks.length,
    aborted,
    unrecoverable,
    failureKinds: [...failureKinds],
    ok: !aborted && files.every((file) => file.ok),
  };
}
