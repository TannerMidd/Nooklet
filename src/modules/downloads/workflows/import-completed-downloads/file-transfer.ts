import { createHash } from "node:crypto";
import path from "node:path";
import {
  lstat,
  link,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  unlink,
  utimes,
} from "node:fs/promises";

export type ImportFilesystemProgress = {
  phase: "copy" | "verify";
  sourcePath: string;
  destinationPath: string;
  bytesProcessed: number;
  totalBytes: number;
};

export type ImportFilesystemProgressReporter = (
  progress: ImportFilesystemProgress,
) => void | Promise<void>;

export type ImportFileTransferOptions = {
  onProgress?: ImportFilesystemProgressReporter;
  /** Exercise the portable streaming path on filesystems where hard links work. */
  disableHardLinks?: boolean;
  /** Keep focused tests small without changing the production chunk size. */
  chunkSizeBytes?: number;
};

type ImportTransferClaim = {
  version: 1;
  sourcePath: string;
  destinationPath: string;
  sourceSize: number;
  sourceMtimeMs: number;
  temporaryPath: string;
  destinationIdentity: ImportDestinationIdentity | null;
};

type ImportDestinationIdentity = {
  device: string;
  inode: string;
  birthtimeMs: number;
};

type ImportTransferArtifacts = {
  claimPath: string;
  temporaryPath: string;
  claim: ImportTransferClaim;
};

const defaultChunkSizeBytes = 4 * 1024 * 1024;
const claimSuffix = ".nooklet-import.json";

function hasErrorCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

async function pathEntry(filePath: string) {
  try {
    return await lstat(filePath);
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
}

function resolvedPath(filePath: string) {
  const resolved = path.resolve(/* turbopackIgnore: true */ filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function transferDigest(sourcePath: string, destinationPath: string) {
  return createHash("sha256")
    .update(`${resolvedPath(sourcePath)}\0${resolvedPath(destinationPath)}`)
    .digest("hex")
    .slice(0, 16);
}

export function importTransferClaimPath(destinationPath: string) {
  return path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}${claimSuffix}`,
  );
}

/**
 * Describes the narrowly scoped artifacts an interrupted transfer is allowed
 * to recover. Exported so recovery behavior can be tested without terminating
 * the test process midway through an actual filesystem write.
 */
export async function describeImportTransferArtifacts(
  sourcePath: string,
  destinationPath: string,
): Promise<ImportTransferArtifacts> {
  const source = await stat(sourcePath);
  if (!source.isFile()) {
    throw new Error(`Import source is not a regular file: ${sourcePath}`);
  }

  const absoluteSourcePath = path.resolve(/* turbopackIgnore: true */ sourcePath);
  const absoluteDestinationPath = path.resolve(/* turbopackIgnore: true */ destinationPath);
  const temporaryPath = path.join(
    path.dirname(absoluteDestinationPath),
    `.${path.basename(absoluteDestinationPath)}.${transferDigest(
      absoluteSourcePath,
      absoluteDestinationPath,
    )}.nooklet-partial`,
  );

  return {
    claimPath: importTransferClaimPath(absoluteDestinationPath),
    temporaryPath,
    claim: {
      version: 1,
      sourcePath: absoluteSourcePath,
      destinationPath: absoluteDestinationPath,
      sourceSize: source.size,
      sourceMtimeMs: source.mtimeMs,
      temporaryPath,
      destinationIdentity: null,
    },
  };
}

function isDestinationIdentity(value: unknown): value is ImportDestinationIdentity {
  if (!value || typeof value !== "object") return false;
  const identity = value as Partial<ImportDestinationIdentity>;
  return typeof identity.device === "string"
    && typeof identity.inode === "string"
    && typeof identity.birthtimeMs === "number"
    && Number.isFinite(identity.birthtimeMs);
}

function isExpectedClaim(value: unknown, expected: ImportTransferClaim): value is ImportTransferClaim {
  if (!value || typeof value !== "object") return false;
  const claim = value as Partial<ImportTransferClaim>;

  return claim.version === 1
    && resolvedPath(claim.sourcePath ?? "") === resolvedPath(expected.sourcePath)
    && resolvedPath(claim.destinationPath ?? "") === resolvedPath(expected.destinationPath)
    && claim.sourceSize === expected.sourceSize
    && claim.sourceMtimeMs === expected.sourceMtimeMs
    && resolvedPath(claim.temporaryPath ?? "") === resolvedPath(expected.temporaryPath)
    && (claim.destinationIdentity === null || isDestinationIdentity(claim.destinationIdentity));
}

function destinationIdentity(entry: Awaited<ReturnType<typeof lstat>>): ImportDestinationIdentity {
  return {
    device: String(entry.dev),
    inode: String(entry.ino),
    birthtimeMs: Number(entry.birthtimeMs),
  };
}

function sameDestinationIdentity(
  left: ImportDestinationIdentity,
  right: ImportDestinationIdentity,
) {
  return left.device === right.device
    && left.inode === right.inode
    && left.birthtimeMs === right.birthtimeMs;
}

async function reportProgress(
  reporter: ImportFilesystemProgressReporter | undefined,
  progress: ImportFilesystemProgress,
) {
  await reporter?.(progress);
}

async function hashFile(
  filePath: string,
  sourcePath: string,
  destinationPath: string,
  totalBytes: number,
  options: ImportFileTransferOptions,
) {
  const handle = await open(filePath, "r");
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(options.chunkSizeBytes ?? defaultChunkSizeBytes);
  let bytesProcessed = 0;

  try {
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      hash.update(chunk.subarray(0, bytesRead));
      bytesProcessed += bytesRead;
      await reportProgress(options.onProgress, {
        phase: "verify",
        sourcePath,
        destinationPath,
        bytesProcessed,
        totalBytes,
      });
    }
  } finally {
    await handle.close();
  }

  return hash.digest("hex");
}

async function hasSameContent(
  sourcePath: string,
  destinationPath: string,
  options: ImportFileTransferOptions,
) {
  const [source, destination] = await Promise.all([
    stat(sourcePath),
    stat(destinationPath),
  ]);

  if (!source.isFile() || !destination.isFile() || source.size !== destination.size) {
    return false;
  }

  const [sourceHash, destinationHash] = await Promise.all([
    hashFile(sourcePath, sourcePath, destinationPath, source.size, options),
    hashFile(destinationPath, sourcePath, destinationPath, destination.size, options),
  ]);

  return sourceHash === destinationHash;
}

async function writeTransferClaim(artifacts: ImportTransferArtifacts) {
  const handle = await open(artifacts.claimPath, "wx", 0o600);

  try {
    await handle.writeFile(`${JSON.stringify(artifacts.claim)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function recordClaimedDestination(
  artifacts: ImportTransferArtifacts,
  identity: ImportDestinationIdentity,
) {
  artifacts.claim.destinationIdentity = identity;
  const handle = await open(artifacts.claimPath, "r+");

  try {
    await handle.truncate(0);
    await handle.writeFile(`${JSON.stringify(artifacts.claim)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function recoverInterruptedTransfer(
  sourcePath: string,
  destinationPath: string,
  artifacts: ImportTransferArtifacts,
  options: ImportFileTransferOptions,
) {
  const claimEntry = await pathEntry(artifacts.claimPath);
  if (!claimEntry) return { kind: "none" } as const;
  if (!claimEntry.isFile()) {
    return {
      kind: "blocked",
      message: `Import recovery marker is not a regular file: ${artifacts.claimPath}`,
    } as const;
  }

  let persistedClaim: unknown;
  try {
    persistedClaim = JSON.parse(await readFile(artifacts.claimPath, "utf8"));
  } catch {
    return {
      kind: "blocked",
      message: `Import recovery marker is invalid: ${artifacts.claimPath}`,
    } as const;
  }

  if (!isExpectedClaim(persistedClaim, artifacts.claim)) {
    return {
      kind: "blocked",
      message: `Another import owns the destination: ${destinationPath}`,
    } as const;
  }

  const destinationEntry = await pathEntry(destinationPath);
  if (destinationEntry && !destinationEntry.isFile()) {
    return {
      kind: "blocked",
      message: `Interrupted import destination is not a regular file: ${destinationPath}`,
    } as const;
  }

  if (
    destinationEntry
    && await hasSameContent(sourcePath, destinationPath, options)
  ) {
    await Promise.all([
      rm(artifacts.temporaryPath, { force: true }),
      rm(artifacts.claimPath, { force: true }),
    ]);
    return { kind: "completed" } as const;
  }

  // A matching source claim alone is insufficient: another process may have
  // replaced the partial final path after the writer died. Delete only the
  // exact inode/device recorded before our first byte was written.
  if (destinationEntry) {
    const claimedIdentity = persistedClaim.destinationIdentity;
    const currentIdentity = destinationIdentity(destinationEntry);
    if (
      !claimedIdentity
      || !sameDestinationIdentity(claimedIdentity, currentIdentity)
      || destinationEntry.size > artifacts.claim.sourceSize
    ) {
      return {
        kind: "blocked",
        message: `Interrupted import destination changed and will not be removed: ${destinationPath}`,
      } as const;
    }
    await unlink(destinationPath);
  }
  await Promise.all([
    rm(artifacts.temporaryPath, { force: true }),
    rm(artifacts.claimPath, { force: true }),
  ]);
  return { kind: "recovered" } as const;
}

export type ImportDestinationResolution =
  | { kind: "ready"; destinationPath: string }
  | { kind: "already-present"; destinationPath: string }
  | { kind: "failed"; message: string };

export async function resolveImportDestination(
  sourcePath: string,
  destinationPath: string,
  options: ImportFileTransferOptions = {},
): Promise<ImportDestinationResolution> {
  await mkdir(path.dirname(destinationPath), { recursive: true });
  const artifacts = await describeImportTransferArtifacts(sourcePath, destinationPath);
  const recovery = await recoverInterruptedTransfer(
    sourcePath,
    destinationPath,
    artifacts,
    options,
  );

  if (recovery.kind === "blocked") {
    return { kind: "failed", message: recovery.message };
  }
  if (recovery.kind === "completed") {
    return { kind: "already-present", destinationPath };
  }

  const destination = await pathEntry(destinationPath);
  if (!destination) return { kind: "ready", destinationPath };
  if (destination.isFile() && await hasSameContent(sourcePath, destinationPath, options)) {
    return { kind: "already-present", destinationPath };
  }

  return {
    kind: "failed",
    message: `Destination file already exists: ${destinationPath}`,
  };
}

async function streamCopy(
  sourcePath: string,
  destinationPath: string,
  options: ImportFileTransferOptions,
  onDestinationOpened?: (identity: ImportDestinationIdentity) => Promise<void>,
) {
  const sourceHandle = await open(sourcePath, "r");
  const source = await sourceHandle.stat();
  const chunk = Buffer.allocUnsafe(options.chunkSizeBytes ?? defaultChunkSizeBytes);
  let bytesProcessed = 0;
  let destinationHandle: Awaited<ReturnType<typeof open>> | null = null;
  let openedIdentity: ImportDestinationIdentity | null = null;
  let completed = false;

  try {
    destinationHandle = await open(destinationPath, "wx", source.mode);
    openedIdentity = destinationIdentity(await destinationHandle.stat());
    if (onDestinationOpened) {
      await onDestinationOpened(openedIdentity);
    }
    for (;;) {
      const { bytesRead } = await sourceHandle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;

      let written = 0;
      while (written < bytesRead) {
        const result = await destinationHandle.write(
          chunk,
          written,
          bytesRead - written,
          null,
        );
        if (result.bytesWritten === 0) {
          throw new Error(`Import copy stopped making progress: ${destinationPath}`);
        }
        written += result.bytesWritten;
      }

      bytesProcessed += bytesRead;
      await reportProgress(options.onProgress, {
        phase: "copy",
        sourcePath,
        destinationPath,
        bytesProcessed,
        totalBytes: source.size,
      });
    }

    await destinationHandle.sync();
    completed = true;
  } finally {
    await Promise.allSettled([
      sourceHandle.close(),
      ...(destinationHandle ? [destinationHandle.close()] : []),
    ]);
    // Normal errors are cleaned immediately. A process termination skips this
    // finally block, leaving the exact claim in place for startup recovery.
    if (destinationHandle && openedIdentity && !completed) {
      const current = await pathEntry(destinationPath).catch(() => null);
      if (current && sameDestinationIdentity(openedIdentity, destinationIdentity(current))) {
        await rm(destinationPath, { force: true }).catch(() => undefined);
      }
    }
  }

  await utimes(destinationPath, source.atime, source.mtime);
}

async function destinationSupportsHardLinks(seedPath: string) {
  const probeSource = `${seedPath}.link-probe`;
  const probeDestination = `${probeSource}.linked`;

  try {
    const handle = await open(probeSource, "wx", 0o600);
    await handle.close();
    await link(probeSource, probeDestination);
    return true;
  } catch {
    return false;
  } finally {
    await Promise.allSettled([
      rm(probeSource, { force: true }),
      rm(probeDestination, { force: true }),
    ]);
  }
}

/**
 * Publish an import without deleting its engine-owned source. The engine root
 * is removed only after request/import persistence succeeds, making a crash
 * between filesystem and database phases idempotently retryable.
 */
export async function transferImportFile(
  sourcePath: string,
  destinationPath: string,
  options: ImportFileTransferOptions = {},
) {
  if (resolvedPath(sourcePath) === resolvedPath(destinationPath)) return;

  await mkdir(path.dirname(destinationPath), { recursive: true });
  const artifacts = await describeImportTransferArtifacts(sourcePath, destinationPath);
  await writeTransferClaim(artifacts).catch((error) => {
    if (hasErrorCode(error, "EEXIST")) {
      throw new Error(`Another import owns the destination: ${destinationPath}`);
    }
    throw error;
  });

  let destinationCreated = false;

  try {
    if (!options.disableHardLinks) {
      try {
        await link(sourcePath, destinationPath);
        destinationCreated = true;
        return;
      } catch (error) {
        if (hasErrorCode(error, "EEXIST")) {
          throw new Error(`Destination file already exists: ${destinationPath}`);
        }
        // A cross-device or link-incompatible target uses the streamed path.
      }
    }

    const hardLinksSupported = !options.disableHardLinks
      && await destinationSupportsHardLinks(artifacts.temporaryPath);

    if (hardLinksSupported) {
      await streamCopy(sourcePath, artifacts.temporaryPath, options);
      try {
        await link(artifacts.temporaryPath, destinationPath);
        destinationCreated = true;
      } catch (error) {
        if (hasErrorCode(error, "EEXIST")) {
          throw new Error(`Destination file already exists: ${destinationPath}`);
        }
        throw error;
      }
    } else {
      await streamCopy(
        sourcePath,
        destinationPath,
        options,
        (identity) => recordClaimedDestination(artifacts, identity),
      );
      destinationCreated = true;
    }
  } catch (error) {
    if (destinationCreated) await rm(destinationPath, { force: true }).catch(() => undefined);
    if (hasErrorCode(error, "EEXIST")) {
      throw new Error(`Destination file already exists: ${destinationPath}`);
    }
    throw error;
  } finally {
    await Promise.allSettled([
      rm(artifacts.temporaryPath, { force: true }),
      rm(artifacts.claimPath, { force: true }),
    ]);
  }
}
